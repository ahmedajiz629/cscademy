"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatScore } from "@/lib/score-format";
import track from "@/lib/tracks/ctf";
import ProblemLeaderboardPanel from "@/components/leaderboards/ProblemLeaderboardPanel";

interface ProblemDetails {
  slug: string;
  name: string;
  description: string;
  points: number;
  downloadableFilePath?: string;
  externalLink?: string;
  leaderboardVisible?: boolean;
}

interface SubmissionResult {
  status: "passed" | "failed";
  score: number;
  reason?: string;
}

function normalizeResourceHref(rawValue?: string): string {
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

export default function CtfProblemPage() {
  const params = useParams();
  const problemId = params.problemId as string;
  const [submittedFlag, setSubmittedFlag] = useState("");
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "leaderboard">("details");

  const problem = useQuery(api.trackProblems.getBySlug, {
    trackSlug: track.id,
    slug: problemId,
  }) as ProblemDetails | null | undefined;
  const scoreRecord = useQuery(api.scores.getMineByProblem, {
    trackSlug: track.id,
    problemSlug: problemId,
  });

  useEffect(() => {
    setResult(null);
    setSubmittedFlag("");
  }, [problemId]);

  async function submitFlag() {
    if (!problem) {
      return;
    }

    setIsSubmitting(true);
    setResult(null);

    try {
      const response = await fetch(track.submitEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackSlug: track.id,
          problemSlug: problemId,
          flag: submittedFlag,
        }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || "Flag submission failed.");
      }

      setResult(data.results as SubmissionResult);
    } catch (error: any) {
      setResult({
        status: "failed",
        score: 0,
        reason: error.message || "Flag submission failed.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (scoreRecord === undefined || problem === undefined) {
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

  const downloadableFileHref = normalizeResourceHref(problem.downloadableFilePath);
  const externalLinkHref = normalizeResourceHref(problem.externalLink);
  const hasDownload = !!downloadableFileHref;
  const hasExternalLink = !!externalLinkHref;
  const isExternalDownload = /^https?:\/\//i.test(downloadableFileHref);
  const bestScore = scoreRecord?.score ?? null;
  const attempts = scoreRecord?.attempts ?? 0;
  const solved = bestScore === problem.points;
  const hasAcceptedFlag = solved || result?.status === "passed";
  const canSubmit = submittedFlag.trim().length > 0;

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link
          href="/tracks/ctf"
          className="text-sm text-gray-400 transition-colors hover:text-white"
        >
          ← Back to CTF
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

      <div className="flex min-w-0 flex-col gap-6 xl:grid xl:grid-cols-[1.1fr_0.9fr]">
        <section className="min-w-0 space-y-6">
          <div className="rounded-2xl border border-gray-800 bg-[#111127] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-amber-300">
                  CTF
                </p>
                <h1 className="text-3xl font-bold text-white">{problem.name}</h1>
                <p className="mt-2 text-sm text-gray-400">
                  Review the resources, inspect the challenge, and submit the exact flag.
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

            {(hasDownload || hasExternalLink) && (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {hasDownload && (
                  <div className="rounded-xl border border-amber-500/20 bg-[linear-gradient(135deg,rgba(251,191,36,0.14),rgba(17,24,39,0.45))] p-4">
                    <p className="mb-2 text-xs uppercase tracking-[0.2em] text-amber-300">
                      Downloadable File
                    </p>
                    <p className="break-all text-sm font-medium text-white">
                      {downloadableFileHref}
                    </p>
                    <a
                      href={downloadableFileHref}
                      {...(isExternalDownload
                        ? { target: "_blank", rel: "noreferrer" }
                        : { download: true })}
                      className="mt-4 inline-flex items-center rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-400/20"
                    >
                      {isExternalDownload ? "Open File URL" : "Download File"}
                    </a>
                  </div>
                )}
                {hasExternalLink && (
                  <div className="rounded-xl border border-sky-500/20 bg-[linear-gradient(135deg,rgba(56,189,248,0.14),rgba(17,24,39,0.45))] p-4">
                    <p className="mb-2 text-xs uppercase tracking-[0.2em] text-sky-300">
                      External Link
                    </p>
                    <p className="break-all text-sm font-medium text-white">
                      {externalLinkHref}
                    </p>
                    <a
                      href={externalLinkHref}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex items-center rounded-xl border border-sky-400/40 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-100 transition-colors hover:bg-sky-400/20"
                    >
                      Open Link
                    </a>
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 rounded-xl border border-gray-800 bg-[#0c0c1d] p-4">
              <p className="whitespace-pre-wrap text-sm leading-7 text-gray-300">
                {problem.description}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <InfoCard label="Submission Type" value="Exact flag string" />
            <InfoCard label="Validation" value="Server-side exact match" />
            <InfoCard label="Solved" value={solved ? "Yes" : "No"} />
          </div>
        </section>

        <section className="min-w-0 space-y-6">
          {hasAcceptedFlag ? (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-6">
              <h2 className="text-lg font-semibold text-emerald-100">Flag Accepted</h2>
              <p className="mt-2 text-sm text-emerald-100/80">
                {solved
                  ? "This challenge is already solved for your account, so the flag form is hidden."
                  : "The submitted flag was accepted, so the flag form is hidden."}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-800 bg-[#111127] p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Flag Submission</h2>
                  <p className="mt-2 text-sm text-gray-400">
                    Submit the exact flag. Matching is case-sensitive apart from trimmed outer whitespace.
                  </p>
                </div>
                <button
                  onClick={submitFlag}
                  disabled={!canSubmit || isSubmitting}
                  className="rounded-xl bg-amber-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-700 disabled:bg-gray-700 disabled:text-gray-500"
                >
                  {isSubmitting ? "Checking Flag..." : "Submit Flag"}
                </button>
              </div>

              <div className="mt-6 min-w-0 rounded-xl border border-gray-800 bg-[#0c0c1d] p-4">
                <label className="mb-2 block text-xs uppercase tracking-wide text-gray-500">
                  Flag
                </label>
                <input
                  value={submittedFlag}
                  onChange={(event) => setSubmittedFlag(event.target.value)}
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="w-full min-w-0 rounded-xl border border-gray-700 bg-[#090914] px-4 py-3 font-mono text-sm text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                  placeholder="flag{...}"
                />
              </div>
            </div>
          )}

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
                <StatusRow label="Reason" value={result.reason || "—"} />
                <StatusRow label="Attempts" value={String(attempts)} />
              </div>
            ) : solved ? (
              <p className="mt-4 text-sm text-emerald-300">
                This challenge is already solved for your account.
              </p>
            ) : (
              <p className="mt-4 text-sm text-gray-500">
                No flag submission has been made for this page load yet.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-gray-800 bg-[#111127] p-6">
            <h2 className="text-lg font-semibold text-white">Progress</h2>
            <div className="mt-4 space-y-3 text-sm">
              <StatusRow
                label="Best Score"
                value={bestScore !== null ? formatScore(bestScore) : "—"}
              />
              <StatusRow label="Attempts" value={String(attempts)} />
              <StatusRow label="Solved" value={solved ? "Yes" : "No"} />
            </div>
          </div>
        </section>
      </div>
      )}
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
  const toneClass =
    tone === "green"
      ? "text-green-400"
      : tone === "red"
        ? "text-red-400"
        : "text-white";

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-800 bg-[#0c0c1d] px-4 py-3">
      <span className="text-gray-500">{label}</span>
      <span className={`text-right font-medium ${toneClass}`}>{value}</span>
    </div>
  );
}