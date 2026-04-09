import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_LOG_CHARS = 50_000;
const DEFAULT_DOCKER_BIN = "docker";
const CONTAINER_WORKDIR = "/workspace";
const CONTAINER_KEEPALIVE_COMMAND =
  'trap "exit 0" TERM INT; while :; do sleep 3600; done';
const SUBMISSION_FILE_NAME = "submission.txt";

export class LogicReverseEngineeringValidationError extends Error {}

export interface LogicReverseEngineeringEvaluationConfig {
  submission: string;
  judgeFilePath?: string;
  image?: string;
  command?: string;
  timeoutMs?: number;
}

export interface LogicReverseEngineeringEvaluationResult {
  status: "passed" | "failed";
  reason?: string;
  lastLine: string;
  logs: string;
  judgeFilePath: string;
}

interface PreparedWorkspace {
  workspaceDir: string;
  judgeFilePath: string;
  judgeFileName: string;
}

interface ParsedEvaluationResult {
  status: "passed" | "failed";
  reason?: string;
  lastLine: string;
}

interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

interface JudgeSourceDescriptor {
  displayValue: string;
  sourcePath: string;
  isRemote: boolean;
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

function parseHttpUrl(rawValue: string): URL | null {
  try {
    const url = new URL(rawValue);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new LogicReverseEngineeringValidationError(
        "Judge source URL must use HTTP or HTTPS."
      );
    }

    return url;
  } catch (error) {
    if (error instanceof LogicReverseEngineeringValidationError) {
      throw error;
    }

    return null;
  }
}

function normalizeJudgeFilePath(rawValue?: string): JudgeSourceDescriptor {
  const value = rawValue?.trim();

  if (!value) {
    throw new LogicReverseEngineeringValidationError(
      "Judge source URL or public path is required."
    );
  }

  const remoteUrl = parseHttpUrl(value);
  if (remoteUrl) {
    return {
      displayValue: remoteUrl.toString(),
      sourcePath: remoteUrl.toString(),
      isRemote: true,
    };
  }

  if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(value) || value.includes("://")) {
    throw new LogicReverseEngineeringValidationError(
      "Judge source URL must be a valid HTTP or HTTPS URL."
    );
  }

  const nextValue = value.replace(/\\/g, "/");
  const normalizedPath = nextValue.startsWith("/") ? nextValue : `/${nextValue}`;

  if (normalizedPath.includes("..")) {
    throw new LogicReverseEngineeringValidationError(
      "Judge file path must stay inside the public directory."
    );
  }

  return {
    displayValue: normalizedPath,
    sourcePath: normalizedPath,
    isRemote: false,
  };
}

function getJudgeAbsolutePath(judgeFilePath: string): string {
  const publicRoot = resolve(process.cwd(), "public");
  const absolutePath = resolve(publicRoot, `.${judgeFilePath}`);

  if (absolutePath !== publicRoot && !absolutePath.startsWith(`${publicRoot}${sep}`)) {
    throw new LogicReverseEngineeringValidationError(
      "Judge file path must stay inside the public directory."
    );
  }

  return absolutePath;
}

function sanitizeBaseName(rawValue: string): string {
  const fileName = basename(rawValue).replace(/[^A-Za-z0-9._-]+/g, "-");
  return fileName.replace(/^[-.]+|[-.]+$/g, "") || "judge";
}

function buildJudgeFileName(judgeFilePath: string): string {
  let fileNameSource = judgeFilePath;

  const remoteUrl = parseHttpUrl(judgeFilePath);
  if (remoteUrl) {
    fileNameSource = remoteUrl.pathname || "judge";
  }

  return sanitizeBaseName(fileNameSource);
}

async function loadJudgeSource(judgeSource: JudgeSourceDescriptor): Promise<string> {
  if (!judgeSource.isRemote) {
    const absoluteJudgePath = getJudgeAbsolutePath(judgeSource.sourcePath);

    try {
      return await readFile(absoluteJudgePath, "utf8");
    } catch (error: any) {
      if (error?.code === "ENOENT") {
        throw new LogicReverseEngineeringValidationError(
          `Judge file ${judgeSource.displayValue} was not found in public/.`
        );
      }

      throw error;
    }
  }

  const response = await fetch(judgeSource.sourcePath, { cache: "no-store" });
  if (!response.ok) {
    throw new LogicReverseEngineeringValidationError(
      `Judge URL ${judgeSource.displayValue} returned ${response.status} ${response.statusText}.`
    );
  }

  return await response.text();
}

async function prepareWorkspace(
  submission: string,
  rawJudgeFilePath?: string
): Promise<PreparedWorkspace> {
  const judgeSource = normalizeJudgeFilePath(rawJudgeFilePath);
  const source = await loadJudgeSource(judgeSource);

  const workspaceDir = await mkdtemp(join(tmpdir(), "logic-re-judge-"));
  const judgeFileName = buildJudgeFileName(judgeSource.displayValue);
  await Promise.all([
    writeFile(join(workspaceDir, judgeFileName), source, "utf8"),
    writeFile(join(workspaceDir, SUBMISSION_FILE_NAME), submission, "utf8"),
  ]);

  return {
    workspaceDir,
    judgeFilePath: judgeSource.displayValue,
    judgeFileName,
  };
}

function parseEvaluationResult(
  logs: string,
  exitCode: number | null,
  timedOut: boolean
): ParsedEvaluationResult {
  const lastLine = getLastNonEmptyLine(logs);

  if (timedOut) {
    return {
      status: "failed",
      reason: "Evaluation timed out before completion.",
      lastLine,
    };
  }

  if (lastLine.startsWith("{")) {
    try {
      const parsed = JSON.parse(lastLine) as {
        ok?: unknown;
        error?: unknown;
        reason?: unknown;
      };

      if (parsed.ok === true) {
        return {
          status: "passed",
          lastLine,
        };
      }

      return {
        status: "failed",
        reason:
          typeof parsed.error === "string"
            ? parsed.error
            : typeof parsed.reason === "string"
              ? parsed.reason
              : "Judge returned ok=false.",
        lastLine,
      };
    } catch {
      // Fall through to the generic failure handling below.
    }
  }

  return {
    status: "failed",
    reason:
      lastLine ||
      (typeof exitCode === "number"
        ? `Docker exited with code ${exitCode}.`
        : "Evaluation failed."),
    lastLine,
  };
}

function formatCommandFailure(action: string, result: CommandResult): string {
  const details = truncateLogs([result.stdout, result.stderr].filter(Boolean).join(""));
  return details
    ? `${action}\n${details}`
    : `${action} Docker exited with code ${result.exitCode ?? "unknown"}.`;
}

function getRequiredImage(config: LogicReverseEngineeringEvaluationConfig): string {
  const image =
    config.image?.trim() ||
    process.env.LOGIC_REVERSE_ENGINEERING_DOCKER_IMAGE?.trim();

  if (!image) {
    throw new LogicReverseEngineeringValidationError(
      "A Docker image must be configured for this logic evaluation."
    );
  }

  return image;
}

function getRequiredCommand(config: LogicReverseEngineeringEvaluationConfig): string {
  const command =
    config.command?.trim() ||
    process.env.LOGIC_REVERSE_ENGINEERING_EVALUATION_COMMAND?.trim();

  if (!command) {
    throw new LogicReverseEngineeringValidationError(
      "An evaluation command must be configured for this logic evaluation."
    );
  }

  return command;
}

function runCommand(
  command: string,
  args: string[],
  options: {
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    stdinText?: string;
  } = {}
): Promise<CommandResult> {
  return new Promise<CommandResult>((resolve, reject) => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    let timedOut = false;

    const child = spawn(command, args, {
      env: options.env ?? process.env,
    });

    const timeoutId =
      options.timeoutMs && options.timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            child.kill();
          }, options.timeoutMs)
        : null;

    child.stdout.on("data", (chunk) => {
      stdout.push(chunk.toString("utf8"));
    });

    child.stderr.on("data", (chunk) => {
      stderr.push(chunk.toString("utf8"));
    });

    if (child.stdin) {
      child.stdin.on("error", () => undefined);
      child.stdin.end(options.stdinText, "utf8");
    }

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      if (error.code === "ENOENT") {
        reject(new Error("Docker is not installed or not available in PATH."));
        return;
      }

      reject(error);
    });

    child.on("close", (exitCode) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      resolve({
        stdout: stdout.join(""),
        stderr: stderr.join(""),
        exitCode,
        timedOut,
      });
    });
  });
}

async function startContainer(dockerBin: string, image: string): Promise<string> {
  const result = await runCommand(dockerBin, [
    "run",
    "-d",
    "--rm",
    "--entrypoint",
    "sh",
    image,
    "-lc",
    CONTAINER_KEEPALIVE_COMMAND,
  ]);

  if (result.exitCode !== 0) {
    throw new Error(formatCommandFailure("Failed to start logic evaluation container.", result));
  }

  const containerId = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  if (!containerId) {
    throw new Error("Docker did not return a container ID for the logic evaluation.");
  }

  return containerId;
}

async function ensureContainerWorkspace(
  dockerBin: string,
  containerId: string
): Promise<void> {
  const result = await runCommand(dockerBin, [
    "exec",
    containerId,
    "sh",
    "-lc",
    `mkdir -p ${CONTAINER_WORKDIR}`,
  ]);

  if (result.exitCode !== 0) {
    throw new Error(formatCommandFailure("Failed to prepare the logic evaluation workspace.", result));
  }
}

async function copyFileToContainer(
  dockerBin: string,
  containerId: string,
  localPath: string,
  fileName: string
): Promise<void> {
  const result = await runCommand(dockerBin, [
    "cp",
    localPath,
    `${containerId}:${CONTAINER_WORKDIR}/${fileName}`,
  ]);

  if (result.exitCode !== 0) {
    throw new Error(formatCommandFailure(`Failed to copy ${fileName} into the logic evaluation container.`, result));
  }
}

async function stopContainer(dockerBin: string, containerId: string | null): Promise<void> {
  if (!containerId) {
    return;
  }

  await runCommand(dockerBin, ["rm", "-f", containerId]).catch(() => undefined);
}

export async function runLogicReverseEngineeringEvaluation(
  config: LogicReverseEngineeringEvaluationConfig
): Promise<LogicReverseEngineeringEvaluationResult> {
  const dockerBin =
    process.env.LOGIC_REVERSE_ENGINEERING_DOCKER_BIN?.trim() || DEFAULT_DOCKER_BIN;
  const image = getRequiredImage(config);
  const command = getRequiredCommand(config);
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const workspace = await prepareWorkspace(config.submission, config.judgeFilePath);
  let containerId: string | null = null;

  try {
    containerId = await startContainer(dockerBin, image);
    await ensureContainerWorkspace(dockerBin, containerId);
    const copyOperations = [
      copyFileToContainer(
        dockerBin,
        containerId,
        join(workspace.workspaceDir, workspace.judgeFileName),
        workspace.judgeFileName
      ),
      copyFileToContainer(
        dockerBin,
        containerId,
        join(workspace.workspaceDir, SUBMISSION_FILE_NAME),
        SUBMISSION_FILE_NAME
      ),
    ];

    await Promise.all(copyOperations);

    const execResult = await runCommand(
      dockerBin,
      [
        "exec",
        "-i",
        "-w",
        CONTAINER_WORKDIR,
        "-e",
        `LOGIC_REVERSE_ENGINEERING_JUDGE_FILE=${CONTAINER_WORKDIR}/${workspace.judgeFileName}`,
        "-e",
        `LOGIC_REVERSE_ENGINEERING_SUBMISSION_FILE=${CONTAINER_WORKDIR}/${SUBMISSION_FILE_NAME}`,
        "-e",
        `LOGIC_REVERSE_ENGINEERING_JUDGE_SOURCE=${workspace.judgeFilePath}`,
        containerId,
        "sh",
        "-lc",
        command,
      ],
      {
        env: process.env,
        stdinText: config.submission,
        timeoutMs,
      }
    );

    const collectedLogs = truncateLogs(`${execResult.stdout}${execResult.stderr}`);
    const parsed = parseEvaluationResult(
      collectedLogs,
      execResult.exitCode,
      execResult.timedOut
    );

    return {
      ...parsed,
      logs: collectedLogs,
      judgeFilePath: workspace.judgeFilePath,
    };
  } finally {
    await stopContainer(dockerBin, containerId);
    await rm(workspace.workspaceDir, { recursive: true, force: true });
  }
}