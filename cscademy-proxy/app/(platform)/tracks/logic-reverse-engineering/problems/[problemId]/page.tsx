"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import OutputPanel from "@/components/OutputPanel";
import { formatScore } from "@/lib/score-format";
import track from "@/lib/tracks/logic-reverse-engineering";

const CodeEditor = dynamic(() => import("@/components/CodeEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[#1e1e2e] text-gray-500">
      Loading editor...
    </div>
  ),
});

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface ProblemDetails {
  slug: string;
  name: string;
  description: string;
  points: number;
  judgeFilePath?: string;
  evaluationImage?: string;
  starterSubmission?: string;
}

interface EvaluationResult {
  status: "passed" | "failed";
  score: number;
  reason?: string;
  lastLine: string;
  logs: string;
  judgeFilePath: string;
}

function normalizeJudgeDownloadHref(rawValue?: string): string {
  const value = rawValue?.trim();

  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    // Fall through to the relative-path normalization below.
  }

  return value.startsWith("/") ? value : `/${value}`;
}

function buildOutputText(result: EvaluationResult): string {
  const summary = [
    `Status: ${result.status.toUpperCase()}`,
    `Score: ${formatScore(result.score)}`,
    `Judge Source: ${result.judgeFilePath}`,
  ];

  if (result.reason) {
    summary.push(`Reason: ${result.reason}`);
  }

  if (result.lastLine) {
    summary.push(`Last Line: ${result.lastLine}`);
  }

  return [...summary, "", "--- logs ---", "", result.logs || "No logs were produced."].join(
    "\n"
  );
}

export default function LogicReverseEngineeringProblemPage() {
  const params = useParams();
  const problemId = params.problemId as string;
  const [user, setUser] = useState<User | null>(null);
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [submission, setSubmission] = useState("");
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [output, setOutput] = useState("");
  const [isError, setIsError] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

  const problem = useQuery(api.trackProblems.getBySlug, {
    trackSlug: track.id,
    slug: problemId,
  }) as ProblemDetails | null | undefined;
  const scoreRecord = useQuery(
    api.scores.getByUserAndProblem,
    user?.id
      ? {
          userId: user.id as Id<"users">,
          trackSlug: track.id,
          problemSlug: problemId,
        }
      : "skip"
  );

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/me")
      .then((response) => response.json())
      .then((data) => {
        if (!cancelled) {
          setUser(data.user);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setIsAuthResolved(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setResult(null);
    setOutput("");
    setIsError(false);
  }, [problemId]);

  useEffect(() => {
    if (problem) {
      setSubmission(problem.starterSubmission ?? "");
    }
  }, [problem]);

  async function evaluateSubmission() {
    if (!problem) {
      return;
    }

    setIsEvaluating(true);
    setResult(null);
    setOutput("");
    setIsError(false);

    try {
      const response = await fetch(track.submitEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackSlug: track.id,
          problemSlug: problemId,
          submission,
        }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || "Evaluation failed.");
      }

      const nextResult = data.results as EvaluationResult;
      setResult(nextResult);
      setIsError(nextResult.status !== "passed");
      setOutput(buildOutputText(nextResult));
    } catch (error: any) {
      setIsError(true);
      setOutput(error.message || "Evaluation failed.");
    } finally {
      setIsEvaluating(false);
    }
  }

  if (!isAuthResolved || problem === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="text-gray-400">Problem not found.</div>
      </div>
    );
  }

  const bestScore = scoreRecord?.score ?? null;
  const judgeDownloadHref = normalizeJudgeDownloadHref(problem.judgeFilePath);
  const isExternalJudgeSource = /^https?:\/\//i.test(judgeDownloadHref);
  const canEvaluate = submission.trim().length > 0;

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link
          href="/tracks/logic-reverse-engineering"
          className="text-sm text-gray-400 transition-colors hover:text-white"
        >
          ← Back to Logic & Reverse Engineering
        </Link>
      </div>

      <div className="flex min-w-0 flex-col gap-6 xl:grid xl:grid-cols-[1fr_1fr]">
        <section className="min-w-0 space-y-6">
          <div className="rounded-2xl border border-gray-800 bg-[#111127] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-cyan-300">
                  Logic & Reverse Engineering
                </p>
                <h1 className="text-3xl font-bold text-white">{problem.name}</h1>
                <p className="mt-2 text-sm text-gray-400">
                  Submit a single expression string. The judge source below is the source of truth.
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Best Score
                </p>
                <p className="text-2xl font-bold text-white">
                  {bestScore !== null ? formatScore(bestScore) : "—"}
                </p>
                <p className="mt-1 text-xs text-gray-500">/{problem.points}</p>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-cyan-500/20 bg-[linear-gradient(135deg,rgba(34,211,238,0.14),rgba(17,24,39,0.45))] p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="mb-2 text-xs uppercase tracking-[0.2em] text-cyan-300">
                    Judge Source
                  </p>
                  <p className="break-all text-sm font-medium text-white">
                    {judgeDownloadHref || "Not configured"}
                  </p>
                </div>
                {judgeDownloadHref ? (
                  <a
                    href={judgeDownloadHref}
                    {...(isExternalJudgeSource
                      ? { target: "_blank", rel: "noreferrer" }
                      : { download: true })}
                    className="inline-flex items-center rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:bg-cyan-400/20"
                  >
                    {isExternalJudgeSource ? "Open Judge URL" : "Download Judge"}
                  </a>
                ) : null}
              </div>
              <p className="mt-4 text-xs text-gray-400">
                The platform copies the judge and submission into the configured Docker image, runs the configured evaluation command, and grants full points only when the final line is <code>{'{"ok":true}'}</code>.
              </p>
            </div>

            <div className="mt-6 rounded-xl border border-gray-800 bg-[#0c0c1d] p-4">
              <p className="whitespace-pre-wrap text-sm leading-7 text-gray-300">
                {problem.description}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <InfoCard label="Submission Type" value="Single string expression" />
            <InfoCard
              label="Judge Runtime"
              value={problem.evaluationImage || "Configured Docker image"}
            />
            <InfoCard label="Passing Signal" value='{"ok":true}' />
          </div>
        </section>

        <section className="min-w-0 space-y-6">
          <div className="rounded-2xl border border-gray-800 bg-[#111127] p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Submission</h2>
                <p className="mt-2 text-sm text-gray-400">
                  Enter the exact string you want the judge to execute.
                </p>
              </div>
              <button
                onClick={evaluateSubmission}
                disabled={!canEvaluate || isEvaluating}
                className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500"
              >
                {isEvaluating ? "Running Docker evaluation..." : "Evaluate Submission"}
              </button>
            </div>

            <div className="mt-6 h-[320px] min-w-0 overflow-hidden rounded-xl border border-gray-800 bg-[#0c0c1d]">
              <CodeEditor
                value={submission}
                onChange={setSubmission}
                language="javascript"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-[#111127] p-6">
            <h2 className="text-lg font-semibold text-white">Latest Result</h2>
            {result ? (
              <div className="mt-4 space-y-3 text-sm">
                <StatusRow
                  label="Status"
                  value={result.status.toUpperCase()}
                  tone={result.status === "passed" ? "green" : "red"}
                />
                <StatusRow label="Score" value={formatScore(result.score)} />
                <StatusRow label="Judge Source" value={result.judgeFilePath} />
                <StatusRow label="Reason" value={result.reason || "—"} />
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500">
                No evaluation has been run for this page load yet.
              </p>
            )}
          </div>

          <div className="h-[360px] overflow-hidden rounded-2xl border border-gray-800 bg-[#111127]">
            <OutputPanel
              output={output}
              isError={isError}
              isLoading={isEvaluating}
              loadingText="Running configured Docker evaluation..."
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-[#111127] p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 break-all text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function StatusRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "green" | "red";
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-gray-800 pb-3 last:border-b-0 last:pb-0">
      <span className="text-gray-500">{label}</span>
      <span
        className={
          tone === "green"
            ? "text-green-400"
            : tone === "red"
              ? "text-red-400"
              : "text-white"
        }
      >
        {value}
      </span>
    </div>
  );
}