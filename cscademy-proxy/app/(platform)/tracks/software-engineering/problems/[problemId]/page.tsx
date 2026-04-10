"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import OutputPanel from "@/components/OutputPanel";
import { formatScore } from "@/lib/score-format";
import track from "@/lib/tracks/software-engineering";
import ProblemLeaderboardPanel from "@/components/leaderboards/ProblemLeaderboardPanel";

interface EvaluationResult {
  status: "passed" | "failed";
  score: number;
  tokenCount: number | null;
  reason?: string;
  lastLine: string;
  logs: string;
  repoUrl: string;
  submissionRef: string;
}

const SUBMISSION_STEPS = [
  "Clone the public starter repository shown below and make the required changes.",
  "Push your work to a private GitHub repository that you control.",
  "Create a fine-grained GitHub token with contents:read access to that repository.",
  "Submit the private repository URL, token, and challenge branch here for evaluation.",
];

function quoteCommandValue(value: string): string {
  return `"${value.replace(/(["\\])/g, "\\$1")}"`;
}

function buildLocalCommand({
  repoUrl,
  submissionRef,
  baseCommit,
  accessToken,
  image,
}: {
  repoUrl: string;
  submissionRef: string;
  baseCommit?: string;
  accessToken: string;
  image?: string;
}): string | null {
  const normalizedRepoUrl = repoUrl.trim();
  const normalizedSubmissionRef = submissionRef.trim() || "challenge";
  const normalizedBaseCommit = baseCommit?.trim() || "";
  const normalizedToken = accessToken.trim();
  const normalizedImage = image?.trim() || "";

  if (!normalizedBaseCommit || !normalizedImage) {
    return null;
  }

  return [
    "docker run -i --rm",
    "-e",
    quoteCommandValue(`REPO_URL=${normalizedRepoUrl}`),
    "-e",
    quoteCommandValue(`SUBMISSION_REF=${normalizedSubmissionRef}`),
    "-e",
    quoteCommandValue(`BASE_COMMIT=${normalizedBaseCommit.slice(0, 7)}`),
    "-e",
    quoteCommandValue(`ACCESS_TOKEN=${normalizedToken}`),
    normalizedImage,
  ].join(" ");
}

function buildCloneCommand(publicRepositoryUrl?: string): string | null {
  const normalizedUrl = publicRepositoryUrl?.trim();
  if (!normalizedUrl) {
    return null;
  }

  return `git clone ${quoteCommandValue(normalizedUrl)}`;
}

function buildSummaryLines(result: EvaluationResult): string[] {
  const lines = [
    `Status: ${result.status.toUpperCase()}`,
    `Branch: ${result.submissionRef}`,
  ];

  if (result.status === "passed") {
    lines.push(`Score: ${formatScore(result.score)}`);
  }

  if (result.tokenCount !== null) {
    lines.push(`Token Count: ${result.tokenCount}`);
  }

  if (result.reason) {
    lines.push(`Reason: ${result.reason}`);
  }

  if (result.lastLine) {
    lines.push(`Last Line: ${result.lastLine}`);
  }

  return lines;
}

function buildOutputText(
  result: EvaluationResult
): string {
  const lines = buildSummaryLines(result);

  return [
    ...lines,
    ...(lines.length > 0 ? ["", "--- logs ---", ""] : []),
    result.logs || "No logs were produced.",
  ].join("\n");
}

export default function SoftwareEngineeringProblemPage() {
  const params = useParams();
  const problemId = params.problemId as string;
  const [repoUrl, setRepoUrl] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [submissionRef, setSubmissionRef] = useState("");
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [output, setOutput] = useState("");
  const [isError, setIsError] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "leaderboard">("details");

  const problem = useQuery(api.trackProblems.getBySlug, {
    trackSlug: track.id,
    slug: problemId,
  });
  const scoreRecord = useQuery(api.scores.getMineByProblem, {
    trackSlug: track.id,
    problemSlug: problemId,
  });

  useEffect(() => {
    setRepoUrl("");
    setAccessToken("");
    setSubmissionRef("");
    setResult(null);
    setOutput("");
    setIsError(false);
  }, [problemId]);

  useEffect(() => {
    if (!problem || submissionRef.trim()) {
      return;
    }

    setSubmissionRef(problem.defaultSubmissionRef || "challenge");
  }, [problem, submissionRef]);

  const bestScore = scoreRecord?.score ?? null;

  async function evaluateSubmission() {
    if (!problem) {
      return;
    }

    setIsEvaluating(true);
    setIsError(false);
    setResult(null);
    setOutput("");

    try {
      const res = await fetch(track.submitEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackSlug: track.id,
          problemSlug: problemId,
          repoUrl,
          accessToken,
          submissionRef,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
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

  if (scoreRecord === undefined || problem === undefined) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-gray-400">Problem not found.</div>
      </div>
    );
  }

  const canEvaluate =
    !!repoUrl.trim() && !!accessToken.trim() && !!submissionRef.trim();
  const cloneCommand = buildCloneCommand(problem.publicRepositoryUrl);
  const localCommand = buildLocalCommand({
    repoUrl,
    submissionRef: submissionRef.trim() || problem.defaultSubmissionRef || "challenge",
    baseCommit: problem.baseCommit,
    accessToken,
    image: problem.evaluationImage,
  });

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link
          href="/tracks/software-engineering"
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← Back to Software Engineering
        </Link>
      </div>

      {problem.leaderboardVisible && (
        <div className="mb-6 flex items-center gap-2 border-b border-gray-800">
          <button
            onClick={() => setActiveTab("details")}
            className={`rounded-t-xl px-4 py-2 text-sm transition-colors ${
              activeTab === "details"
                ? "bg-[#111127] text-white"
                : "text-gray-500 hover:text-white"
            }`}
          >
            Challenge
          </button>
          <button
            onClick={() => setActiveTab("leaderboard")}
            className={`rounded-t-xl px-4 py-2 text-sm transition-colors ${
              activeTab === "leaderboard"
                ? "bg-[#111127] text-white"
                : "text-gray-500 hover:text-white"
            }`}
          >
            Leaderboard
          </button>
        </div>
      )}

      {problem.leaderboardVisible && activeTab === "leaderboard" ? (
        <ProblemLeaderboardPanel trackSlug={track.id} problemSlug={problemId} />
      ) : (

      <div className="flex flex-col gap-6 xl:grid xl:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-6">
          <div className="rounded-2xl border border-gray-800 bg-[#111127] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-blue-300 mb-2">
                  Software Engineering Challenge
                </p>
                <h1 className="text-3xl font-bold text-white">{problem.name}</h1>
                <p className="text-sm text-gray-400 mt-2">
                  Submit a private GitHub repository branch and let the challenge runner evaluate it inside Docker.
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Best Score
                </p>
                <p className="text-2xl font-bold text-white">
                  {bestScore !== null ? formatScore(bestScore) : "—"}
                </p>
                <p className="text-xs text-gray-500 mt-1">/{problem.points}</p>
              </div>
            </div>

            {problem.publicRepositoryUrl && (
              <div className="mt-6 rounded-xl border border-cyan-500/20 bg-[linear-gradient(135deg,rgba(8,145,178,0.18),rgba(17,24,39,0.45))] p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-[0.2em] text-cyan-300 mb-2">
                      Public Starter Repository
                    </p>
                    <a
                      href={problem.publicRepositoryUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-white hover:text-cyan-100 break-all transition-colors"
                    >
                      {problem.publicRepositoryUrl}
                    </a>
                  </div>
                  <a
                    href={problem.publicRepositoryUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/20 transition-colors"
                  >
                    Open Repository
                  </a>
                </div>

                {cloneCommand && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
                      Clone Command
                    </p>
                    <textarea
                      readOnly
                      rows={2}
                      spellCheck={false}
                      value={cloneCommand}
                      className="w-full resize-none rounded-xl border border-gray-700 bg-[#0b1324] px-4 py-3 text-sm font-mono text-white focus:outline-none"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 rounded-xl border border-gray-800 bg-[#0c0c1d] p-4">
              <p className="text-sm text-gray-300 whitespace-pre-wrap leading-7">
                {problem.description}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <InfoCard
              label="Default Branch"
              value={problem.defaultSubmissionRef || "challenge"}
            />
            <InfoCard label="Base Commit" value={problem.baseCommit?.slice(0, 7) || "Not configured"} />
            <InfoCard
              label="Docker Image"
              value={problem.evaluationImage || "Not configured"}
            />
          </div>

          <div className="rounded-2xl border border-gray-800 bg-[#111127] p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Submission Flow</h2>
            <div className="space-y-3">
              {SUBMISSION_STEPS.map((step, index) => (
                <div key={step} className="flex gap-3">
                  <span className="mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-gray-800 text-xs text-gray-300">
                    {index + 1}
                  </span>
                  <p className="text-sm text-gray-300">{step}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl border border-gray-800 bg-[#111127] p-6">
            <h2 className="text-lg font-semibold text-white">Evaluate Submission</h2>
            <p className="text-sm text-gray-400 mt-2">
              The token is used only for this evaluation request and is not stored in the database.
            </p>

            <div className="space-y-4 mt-6">
              <Field label="Private Repository URL">
                <input
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  className="w-full rounded-xl border border-gray-700 bg-[#0c0c1d] px-4 py-3 text-sm text-white focus:border-blue-500 focus:outline-none"
                  placeholder="https://github.com/<user>/<repo>"
                />
              </Field>

              <Field label="Submission Branch">
                <input
                  value={submissionRef}
                  onChange={(e) => setSubmissionRef(e.target.value)}
                  className="w-full rounded-xl border border-gray-700 bg-[#0c0c1d] px-4 py-3 text-sm text-white focus:border-blue-500 focus:outline-none"
                  placeholder="challenge"
                />
              </Field>

              <Field label="Fine-Grained Access Token">
                <input
                  type="text"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  className="w-full rounded-xl border border-gray-700 bg-[#0c0c1d] px-4 py-3 text-sm text-white focus:border-blue-500 focus:outline-none"
                  placeholder="github_pat_..."
                  autoComplete="off"
                />
              </Field>

              <Field label="Local Docker Command">
                <textarea
                  readOnly
                  value={
                    localCommand ||
                    "This challenge is not configured yet. Add a Docker image and base commit first."
                  }
                  rows={6}
                  spellCheck={false}
                  className="w-full resize-none rounded-xl border border-gray-700 bg-[#0c0c1d] px-4 py-3 text-sm font-mono text-white focus:outline-none"
                />
              </Field>
            </div>

            <button
              onClick={evaluateSubmission}
              disabled={!canEvaluate || isEvaluating}
              className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500"
            >
              {isEvaluating ? "Running Docker evaluation..." : "Evaluate Submission"}
            </button>
          </div>

          <div className="rounded-2xl border border-gray-800 bg-[#111127] p-6">
            <h2 className="text-lg font-semibold text-white">Latest Result</h2>
            {result ? (
              <div className="mt-4 space-y-3 text-sm">
                <StatusRow label="Status" value={result.status.toUpperCase()} tone={result.status === "passed" ? "green" : "red"} />
                <StatusRow label="Score" value={formatScore(result.score)} />
                <StatusRow label="Branch" value={result.submissionRef} />
                <StatusRow
                  label="Token Count"
                  value={result.tokenCount !== null ? String(result.tokenCount) : "—"}
                />
                <StatusRow label="Reason" value={result.reason || "—"} />
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500">
                No evaluation has been run for this page load yet.
              </p>
            )}
          </div>

          <div className="h-[420px] overflow-hidden rounded-2xl border border-gray-800 bg-[#111127]">
            <OutputPanel
              output={output}
              isError={isError}
              isLoading={isEvaluating}
              loadingText="Running challenge container..."
            />
          </div>
        </section>
      </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-[#111127] p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-white break-all">{value}</p>
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