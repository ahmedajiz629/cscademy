import { spawn } from "child_process";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_LOG_CHARS = 50_000;
const DEFAULT_DOCKER_BIN = "docker";

export class SoftwareEngineeringValidationError extends Error {}

export interface SoftwareEngineeringEvaluationConfig {
  repoUrl: string;
  submissionRef: string;
  baseCommit: string;
  accessToken: string;
  image: string;
  timeoutMs?: number;
}

export interface SoftwareEngineeringEvaluationResult {
  status: "passed" | "failed";
  score: number;
  tokenCount: number | null;
  reason?: string;
  lastLine: string;
  logs: string;
  repoUrl: string;
  submissionRef: string;
}

interface ParsedEvaluationResult {
  status: "passed" | "failed";
  score: number;
  tokenCount: number | null;
  reason?: string;
  lastLine: string;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function truncateLogs(logs: string): string {
  if (logs.length <= MAX_LOG_CHARS) {
    return logs;
  }

  return `[logs truncated to last ${MAX_LOG_CHARS} characters]\n${logs.slice(
    -MAX_LOG_CHARS
  )}`;
}

function getLastNonEmptyLine(logs: string): string {
  const lines = logs
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  return lines.at(-1) ?? "";
}

function redactSecrets(logs: string, secrets: string[]): string {
  return secrets.reduce((current, secret) => {
    if (!secret) {
      return current;
    }

    return current.split(secret).join("[REDACTED]");
  }, logs);
}

function parseJsonResult(lastLine: string): {
  status: string;
  score: number;
  tokenCount: number | null;
  reason?: string;
} | null {
  if (!lastLine.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(lastLine);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const score = coerceNumber((parsed as { score?: unknown }).score) ?? 0;
    const tokenCount =
      coerceNumber((parsed as { tokenCount?: unknown }).tokenCount) ?? null;
    const status = String((parsed as { status?: unknown }).status ?? "failed");
    const reasonValue = (parsed as { reason?: unknown }).reason;

    return {
      status,
      score,
      tokenCount,
      reason: typeof reasonValue === "string" ? reasonValue : undefined,
    };
  } catch {
    return null;
  }
}

function parseEvaluationResult(
  logs: string,
  submissionRef: string,
  exitCode: number | null,
  timedOut: boolean
): ParsedEvaluationResult {
  const lastLine = getLastNonEmptyLine(logs);

  if (timedOut) {
    return {
      status: "failed" as const,
      score: 0,
      tokenCount: null,
      reason: "Evaluation timed out before completion.",
      lastLine,
    };
  }

  const parsed = parseJsonResult(lastLine);
  if (parsed) {
    return {
      status: parsed.status === "passed" ? "passed" : "failed",
      score: parsed.status === "passed" ? parsed.score : 0,
      tokenCount: parsed.tokenCount,
      reason:
        parsed.status === "passed"
          ? undefined
          : parsed.reason || "Evaluation failed.",
      lastLine,
    };
  }

  if (
    lastLine.includes(
      "fatal: could not read Username for 'https://github.com': No such device or address"
    )
  ) {
    return {
      status: "failed" as const,
      score: 0,
      tokenCount: null,
      reason:
        "The repository token was rejected by GitHub. Check that it is a fine-grained contents:read token granted to this repository.",
      lastLine,
    };
  }

  if (lastLine.includes("fatal: couldn't find remote ref")) {
    return {
      status: "failed" as const,
      score: 0,
      tokenCount: null,
      reason: `Branch "${submissionRef}" was not found on the remote repository.`,
      lastLine,
    };
  }

  if (lastLine.startsWith("fatal:")) {
    return {
      status: "failed" as const,
      score: 0,
      tokenCount: null,
      reason: lastLine,
      lastLine,
    };
  }

  return {
    status: "failed" as const,
    score: 0,
    tokenCount: null,
    reason:
      lastLine ||
      (typeof exitCode === "number"
        ? `Docker exited with code ${exitCode}.`
        : "Evaluation failed."),
    lastLine,
  };
}

export function normalizeRepositoryUrl(rawValue: string): string {
  const value = rawValue.trim();
  if (!value) {
    throw new SoftwareEngineeringValidationError("Repository URL is required.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SoftwareEngineeringValidationError(
      "Repository URL must be a valid GitHub HTTPS URL."
    );
  }

  if (url.protocol !== "https:") {
    throw new SoftwareEngineeringValidationError(
      "Repository URL must use HTTPS."
    );
  }

  if (url.hostname !== "github.com") {
    throw new SoftwareEngineeringValidationError(
      "Repository URL must point to github.com."
    );
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 2) {
    throw new SoftwareEngineeringValidationError(
      "Repository URL must have the form https://github.com/<owner>/<repo>."
    );
  }

  const repoName = segments[1].replace(/\.git$/i, "");
  if (!repoName) {
    throw new SoftwareEngineeringValidationError("Repository name is missing.");
  }

  url.pathname = `/${segments[0]}/${repoName}`;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function normalizeSubmissionRef(
  rawValue: string,
  fallbackValue: string
): string {
  const value = (rawValue.trim() || fallbackValue.trim()).trim();
  if (!value) {
    throw new SoftwareEngineeringValidationError(
      "Submission branch is required."
    );
  }

  if (/^[0-9a-f]{7,40}$/i.test(value)) {
    throw new SoftwareEngineeringValidationError(
      "Submission branch must be a branch name, not a commit hash."
    );
  }

  if (
    !/^[A-Za-z0-9._/-]+$/.test(value) ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("..") ||
    value.includes("@{")
  ) {
    throw new SoftwareEngineeringValidationError(
      "Submission branch contains invalid characters."
    );
  }

  return value;
}

export async function runSoftwareEngineeringEvaluation(
  config: SoftwareEngineeringEvaluationConfig
): Promise<SoftwareEngineeringEvaluationResult> {
  const dockerBin =
    process.env.SOFTWARE_ENGINEERING_DOCKER_BIN?.trim() || DEFAULT_DOCKER_BIN;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<SoftwareEngineeringEvaluationResult>((resolve, reject) => {
    const logs: string[] = [];
    let timedOut = false;

    const child = spawn(
      dockerBin,
      [
        "run",
        "-i",
        "--rm",
        "-e",
        `REPO_URL=${config.repoUrl}`,
        "-e",
        `SUBMISSION_REF=${config.submissionRef}`,
        "-e",
        `BASE_COMMIT=${config.baseCommit.slice(0, 7)}`,
        "-e",
        `ACCESS_TOKEN=${config.accessToken}`,
        config.image,
      ],
      {
        env: process.env,
      }
    );

    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      logs.push(chunk.toString("utf8"));
    });

    child.stderr.on("data", (chunk) => {
      logs.push(chunk.toString("utf8"));
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timeoutId);
      if (error.code === "ENOENT") {
        reject(new Error("Docker is not installed or not available in PATH."));
        return;
      }

      reject(error);
    });

    child.on("close", (exitCode) => {
      clearTimeout(timeoutId);

      const combinedLogs = truncateLogs(
        redactSecrets(logs.join(""), [config.accessToken])
      );
      const parsed = parseEvaluationResult(
        combinedLogs,
        config.submissionRef,
        exitCode,
        timedOut
      );

      resolve({
        ...parsed,
        logs: combinedLogs,
        repoUrl: config.repoUrl,
        submissionRef: config.submissionRef,
      });
    });
  });
}