import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve, sep } from "node:path";
import * as ts from "typescript";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_LOG_CHARS = 50_000;
const DEFAULT_DOCKER_BIN = "docker";
const DEFAULT_DOCKER_IMAGE = "node:22-alpine";
const DEFAULT_JUDGE_FILE_PATH = "/test.ts";

export class LogicReverseEngineeringValidationError extends Error {}

export interface LogicReverseEngineeringEvaluationConfig {
  submission: string;
  judgeFilePath?: string;
  image?: string;
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
}

interface ParsedEvaluationResult {
  status: "passed" | "failed";
  reason?: string;
  lastLine: string;
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

function normalizeJudgeFilePath(rawValue?: string): string {
  const value = (rawValue?.trim() || DEFAULT_JUDGE_FILE_PATH).replace(/\\/g, "/");
  const nextValue = value.startsWith("/") ? value : `/${value}`;

  if (nextValue.includes("..")) {
    throw new LogicReverseEngineeringValidationError(
      "Judge file path must stay inside the public directory."
    );
  }

  if (!/\.(ts|js)$/i.test(nextValue)) {
    throw new LogicReverseEngineeringValidationError(
      "Judge file path must point to a .ts or .js file."
    );
  }

  return nextValue;
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

function createRunnerSource(entryFileName: string): string {
  return [
    'const { readFileSync } = require("node:fs");',
    'const { spawnSync } = require("node:child_process");',
    'const submission = readFileSync("/workspace/submission.txt", "utf8");',
    `const result = spawnSync(process.execPath, ["/workspace/${entryFileName}", submission], { stdio: "inherit" });`,
    'if (result.error) {',
    '  console.error(result.error);',
    '  process.exit(1);',
    '}',
    'process.exit(result.status ?? 1);',
  ].join("\n");
}

async function prepareWorkspace(
  submission: string,
  rawJudgeFilePath?: string
): Promise<PreparedWorkspace> {
  const judgeFilePath = normalizeJudgeFilePath(rawJudgeFilePath);
  const absoluteJudgePath = getJudgeAbsolutePath(judgeFilePath);

  let source: string;
  try {
    source = await readFile(absoluteJudgePath, "utf8");
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      throw new LogicReverseEngineeringValidationError(
        `Judge file ${judgeFilePath} was not found in public/.`
      );
    }

    throw error;
  }

  const workspaceDir = await mkdtemp(join(tmpdir(), "logic-re-judge-"));
  const entryFileName = `${basename(judgeFilePath, extname(judgeFilePath))}.js`;
  const compiledSource =
    extname(judgeFilePath).toLowerCase() === ".ts"
      ? ts.transpileModule(source, {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
          },
        }).outputText
      : source;

  await Promise.all([
    writeFile(join(workspaceDir, entryFileName), compiledSource, "utf8"),
    writeFile(join(workspaceDir, "submission.txt"), submission, "utf8"),
    writeFile(join(workspaceDir, "runner.js"), createRunnerSource(entryFileName), "utf8"),
  ]);

  return { workspaceDir, judgeFilePath };
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

function formatDockerVolume(workspaceDir: string): string {
  return `${workspaceDir.replace(/\\/g, "/")}:/workspace:ro`;
}

export async function runLogicReverseEngineeringEvaluation(
  config: LogicReverseEngineeringEvaluationConfig
): Promise<LogicReverseEngineeringEvaluationResult> {
  const dockerBin =
    process.env.LOGIC_REVERSE_ENGINEERING_DOCKER_BIN?.trim() || DEFAULT_DOCKER_BIN;
  const image =
    config.image?.trim() ||
    process.env.LOGIC_REVERSE_ENGINEERING_DOCKER_IMAGE?.trim() ||
    DEFAULT_DOCKER_IMAGE;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const workspace = await prepareWorkspace(config.submission, config.judgeFilePath);

  try {
    return await new Promise<LogicReverseEngineeringEvaluationResult>((resolve, reject) => {
      const logs: string[] = [];
      let timedOut = false;

      const child = spawn(
        dockerBin,
        [
          "run",
          "--rm",
          "-i",
          "-v",
          formatDockerVolume(workspace.workspaceDir),
          image,
          "node",
          "/workspace/runner.js",
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
        const collectedLogs = truncateLogs(logs.join(""));
        const parsed = parseEvaluationResult(collectedLogs, exitCode, timedOut);

        resolve({
          ...parsed,
          logs: collectedLogs,
          judgeFilePath: workspace.judgeFilePath,
        });
      });
    });
  } finally {
    await rm(workspace.workspaceDir, { recursive: true, force: true });
  }
}