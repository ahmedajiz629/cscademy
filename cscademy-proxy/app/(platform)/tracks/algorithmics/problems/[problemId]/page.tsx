"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import track from "@/lib/tracks/algorithmics";
import { formatScore } from "@/lib/score-format";
import {
  buildOfflineProbeUrl,
  formatOfflineClosedReason,
  OFFLINE_ANTI_CHEAT_RETRY_INTERVAL_MS,
} from "@/lib/offline-anti-cheat";
import {
  canStartOfflineTaskFromUrl,
  resolveOfflineGatewayUrlInBrowser,
} from "@/lib/offline-gateway";
import { isOfflineSessionStale } from "@/lib/offline-session";
import OutputPanel from "@/components/OutputPanel";

const CodeEditor = dynamic(() => import("@/components/CodeEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 bg-[#1e1e2e] flex items-center justify-center text-gray-500">
      Loading editor...
    </div>
  ),
});

interface ProblemDetails {
  slug: string;
  name: string;
  description: string;
  points: number;
  sampleInput?: string;
  sampleOutput?: string;
  starterCode?: string;
  isOffline?: boolean;
  offlineTaskPreDescription?: string;
  probeImageUrl?: string;
}

interface OfflineProblemPreview {
  slug: string;
  name: string;
  points: number;
  isOffline: true;
  offlineTaskPreDescription?: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface OfflineRuntimeConfig {
  probeImageUrl: string | null;
}

type ProblemAccessState =
  | { status: "loading" }
  | { status: "not_found" }
  | {
      status: "closed";
      problem: OfflineProblemPreview;
      closedReason?: string;
    }
  | {
      status: "offline_confirmation";
      problem: OfflineProblemPreview;
      canStartOfflineTask: boolean;
    }
  | { status: "ready"; problem: ProblemDetails };

function toOfflineProblemPreview(
  problem:
    | Pick<ProblemDetails, "slug" | "name" | "points" | "offlineTaskPreDescription">
    | OfflineProblemPreview
): OfflineProblemPreview {
  return {
    slug: problem.slug,
    name: problem.name,
    points: problem.points,
    isOffline: true,
    offlineTaskPreDescription: problem.offlineTaskPreDescription,
  };
}

export default function AlgorithmicsProblemIDEPage() {
  const params = useParams();
  const trackId = track.id;
  const problemId = params.problemId as string;
  const [user, setUser] = useState<User | null>(null);
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [runtimeConfig, setRuntimeConfig] = useState<OfflineRuntimeConfig | null>(null);

  const languages = useQuery(api.programmingLanguages.listByTrack, {
    trackSlug: trackId,
  });
  const problemRecord = useQuery(api.trackProblems.getBySlug, {
    trackSlug: trackId,
    slug: problemId,
  });
  const session = useQuery(
    api.offlineProblemSessions.getByUserAndProblem,
    user?.id
      ? {
          userId: user.id as Id<"users">,
          trackSlug: trackId,
          problemSlug: problemId,
        }
      : "skip"
  );

  const [langId, setLangId] = useState("");
  const [code, setCode] = useState("");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [testResults, setTestResults] = useState<any[] | null>(null);
  const [isError, setIsError] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [isConnectingOffline, setIsConnectingOffline] = useState(false);
  const [offlineError, setOfflineError] = useState("");
  const [optimisticClosedState, setOptimisticClosedState] = useState<
    | {
        problem: OfflineProblemPreview;
        closedReason?: string;
      }
    | null
  >(null);
  const [now, setNow] = useState(() => Date.now());

  const socketRef = useRef<WebSocket | null>(null);
  const offlineStartedRef = useRef(false);
  const probeRetryTimeoutRef = useRef<number | null>(null);
  const probeImageRef = useRef<HTMLImageElement | null>(null);
  const pendingCloseReasonRef = useRef<string | null>(null);
  const probeTriggeredRef = useRef(false);

  const clearProbeRequest = useCallback(() => {
    if (probeRetryTimeoutRef.current !== null) {
      window.clearTimeout(probeRetryTimeoutRef.current);
      probeRetryTimeoutRef.current = null;
    }

    if (probeImageRef.current) {
      probeImageRef.current.onload = null;
      probeImageRef.current.onerror = null;
      probeImageRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setUser(d.user);
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
    let cancelled = false;

    fetch("/api/offline/runtime-config", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          throw new Error("Failed to load offline runtime config");
        }

        return r.json();
      })
      .then((data) => {
        if (!cancelled) {
          setRuntimeConfig(data);
        }
      })
      .catch(() => {
        if (!cancelled && typeof window !== "undefined") {
          setRuntimeConfig({
            probeImageUrl: null,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setLangId("");
    setCode("");
    setInput("");
    setOutput("");
    setTestResults(null);
    setScore(null);
    setOfflineError("");
    setOptimisticClosedState(null);
    pendingCloseReasonRef.current = null;
    probeTriggeredRef.current = false;
    clearProbeRequest();
  }, [clearProbeRequest, problemId]);

  useEffect(() => {
    if (session?.status !== "active") {
      setNow(Date.now());
      return;
    }

    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [session?.lastHeartbeatAt, session?.status]);

  useEffect(() => {
    return () => {
      clearProbeRequest();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [clearProbeRequest]);

  const problemState = useMemo<ProblemAccessState>(() => {
    if (!isAuthResolved || problemRecord === undefined) {
      return { status: "loading" };
    }

    if (!problemRecord) {
      return { status: "not_found" };
    }

    if (problemRecord.isOffline !== true) {
      return { status: "ready", problem: problemRecord };
    }

    if (!user || session === undefined) {
      return { status: "loading" };
    }

    if (optimisticClosedState) {
      return {
        status: "closed",
        problem: optimisticClosedState.problem,
        closedReason: optimisticClosedState.closedReason,
      };
    }

    if (session?.status === "terminated" || isOfflineSessionStale(session, now)) {
      return {
        status: "closed",
        problem: toOfflineProblemPreview(problemRecord),
        closedReason: session?.terminatedReason ?? "connection_lost",
      };
    }

    if (session?.status === "active") {
      return {
        status: "ready",
        problem: {
          ...problemRecord,
          probeImageUrl:
            session.flagReason ? undefined : runtimeConfig?.probeImageUrl ?? undefined,
        },
      };
    }

    return {
      status: "offline_confirmation",
      problem: toOfflineProblemPreview(problemRecord),
      canStartOfflineTask:
        typeof window !== "undefined"
          ? canStartOfflineTaskFromUrl(window.location.href)
          : false,
    };
  }, [
    isAuthResolved,
    now,
    optimisticClosedState,
    problemRecord,
    runtimeConfig,
    session,
    user,
  ]);

  const problem = problemState.status === "ready" ? problemState.problem : null;
  const defaultLangId = languages?.[0]?.langId || "1";

  const starterCodeMap = useMemo(() => {
    if (!problem?.starterCode) return {};
    try {
      return JSON.parse(problem.starterCode);
    } catch {
      return {};
    }
  }, [problem?.starterCode]);

  useEffect(() => {
    if (languages && languages.length > 0 && !langId) {
      setLangId(languages[0].langId);
    }
  }, [languages, langId]);

  useEffect(() => {
    if (problem && langId) {
      const starter = starterCodeMap[langId] || starterCodeMap[defaultLangId] || "";
      setCode(starter);
    }
  }, [problem, langId, defaultLangId, starterCodeMap]);

  useEffect(() => {
    if (problem?.sampleInput && !input) {
      setInput(problem.sampleInput);
    }
  }, [problem, input]);

  const currentLang = languages?.find((l) => l.langId === langId);
  const codemirrorLang = currentLang?.codemirrorMode || "cpp";

  const reportProbeHit = useCallback(() => {
    if (probeTriggeredRef.current) {
      return;
    }

    probeTriggeredRef.current = true;
    clearProbeRequest();

    void fetch("/api/offline/pulse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackSlug: trackId, problemSlug: problemId }),
    }).catch(() => {
      // Silent best-effort report. The participant should not see anything.
    });
  }, [clearProbeRequest, problemId, trackId]);

  useEffect(() => {
    clearProbeRequest();

    if (
      problemState.status !== "ready" ||
      problemState.problem.isOffline !== true ||
      !problemState.problem.probeImageUrl ||
      probeTriggeredRef.current
    ) {
      return;
    }

    const offlineProblem = problemState.problem;
    const probeImageUrl = offlineProblem.probeImageUrl;
    if (!probeImageUrl) {
      return;
    }

    let cancelled = false;
    let attempt = 0;

    const scheduleRetry = () => {
      probeRetryTimeoutRef.current = window.setTimeout(() => {
        probeRetryTimeoutRef.current = null;
        if (!cancelled) {
          loadProbe();
        }
      }, OFFLINE_ANTI_CHEAT_RETRY_INTERVAL_MS);
    };

    const loadProbe = () => {
      if (cancelled || probeTriggeredRef.current) {
        return;
      }

      attempt += 1;
      const image = new Image();
      probeImageRef.current = image;
      image.decoding = "async";
      image.referrerPolicy = "no-referrer";

      image.onload = () => {
        probeImageRef.current = null;
        if (!cancelled) {
          reportProbeHit();
        }
      };

      image.onerror = () => {
        if (probeImageRef.current === image) {
          probeImageRef.current = null;
        }
        if (!cancelled) {
          scheduleRetry();
        }
      };

      image.src = buildOfflineProbeUrl(
        probeImageUrl,
        `${Date.now()}-${attempt}`
      );
    };

    loadProbe();

    return () => {
      cancelled = true;
      clearProbeRequest();
    };
  }, [clearProbeRequest, problemState, reportProbeHit]);

  const runCode = useCallback(async () => {
    if (!problem) return;
    setIsRunning(true);
    setOutput("");
    setTestResults(null);
    setIsError(false);
    setScore(null);

    try {
      const res = await fetch(track.runEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackSlug: trackId,
          problemSlug: problemId,
          sourceCode: code,
          input,
          programmingLanguageId: langId,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setOutput(data.error);
        setIsError(true);
      } else if (data.results) {
        const results = data.results;
        if (results.error) {
          setOutput(results.error);
          setIsError(true);
        } else {
          const stdout = results.stdout || "";
          const stderr = results.stderr || "";
          setOutput(stdout + (stderr ? "\n--- stderr ---\n" + stderr : ""));
          setIsError(!!stderr && !stdout);
        }
      }
    } catch (err: any) {
      setOutput(err.message);
      setIsError(true);
    } finally {
      setIsRunning(false);
    }
  }, [code, input, langId, problem, problemId, trackId]);

  const submitCode = useCallback(async () => {
    if (!problem) return;
    setIsSubmitting(true);
    setOutput("");
    setTestResults(null);
    setIsError(false);
    setScore(null);

    try {
      const res = await fetch(track.submitEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackSlug: trackId,
          problemSlug: problemId,
          sourceCode: code,
          programmingLanguageId: langId,
        }),
      });

      const data = await res.json();
      if (data.error) {
        setOutput(data.error);
        setIsError(true);
      } else if (data.results) {
        const results = data.results;
        const sc =
          results.score !== undefined && results.score !== null
            ? results.score
            : null;
        setScore(sc);

        if (results.tests && Array.isArray(results.tests)) {
          setTestResults(results.tests);
        }

        const lines: string[] = [];
        if (sc !== null) lines.push(`Score: ${formatScore(sc)}/100`);
        if (results.tests && Array.isArray(results.tests)) {
          const passed = results.tests.filter((t: any) => t.checkerScore === 1).length;
          lines.push(`Tests: ${passed}/${results.tests.length} passed`);
        }
        setOutput(lines.join("\n") || "Submitted successfully");
      }
    } catch (err: any) {
      setOutput(err.message);
      setIsError(true);
    } finally {
      setIsSubmitting(false);
    }
  }, [code, langId, problem, problemId, trackId]);

  const startOfflineTask = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }

    if (!canStartOfflineTaskFromUrl(window.location.href)) {
      setOfflineError("You need to open this task from the offline room to start it.");
      return;
    }

    const gatewayUrl = resolveOfflineGatewayUrlInBrowser(window.location.href);

    setIsConnectingOffline(true);
    setOfflineError("");
    offlineStartedRef.current = false;
    pendingCloseReasonRef.current = null;
    probeTriggeredRef.current = false;
    setOptimisticClosedState(null);
    clearProbeRequest();
    socketRef.current?.close();

    try {
      const res = await fetch("/api/offline/problem-entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackSlug: trackId,
          problemSlug: problemId,
          gatewayUrl,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to start offline task");
      }

      const wsUrl = new URL(gatewayUrl);
      wsUrl.searchParams.set("token", data.token);
      const socket = new WebSocket(wsUrl.toString());
      socketRef.current = socket;

      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          return;
        }

        try {
          const payload = JSON.parse(event.data);
          if (payload.type === "ready") {
            offlineStartedRef.current = true;
            setOfflineError("");
            setIsConnectingOffline(false);
            setOptimisticClosedState(null);
          }
        } catch {
          // Ignore non-JSON payloads from the offline room connection.
        }
      });

      socket.addEventListener("error", () => {
        setOfflineError("Could not connect from this offline room session.");
      });

      socket.addEventListener("close", () => {
        socketRef.current = null;
        clearProbeRequest();
        if (offlineStartedRef.current) {
          const closedReason = pendingCloseReasonRef.current ?? "connection_lost";
          pendingCloseReasonRef.current = null;
          setOptimisticClosedState({
            problem:
              problemRecord
                ? toOfflineProblemPreview(problemRecord)
                : toOfflineProblemPreview({
                    slug: problemId,
                    name: "Offline task",
                    points: 0,
                  }),
            closedReason,
          });
        } else {
          setIsConnectingOffline(false);
          setOfflineError("Connection to the offline room was lost before the task started.");
        }
      });
    } catch (err: any) {
      setIsConnectingOffline(false);
      setOfflineError(err.message || "Failed to start offline task");
    }
  }, [clearProbeRequest, problemId, problemRecord, trackId]);

  if (problemState.status === "loading") {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (problemState.status === "not_found") {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-gray-400">Problem not found.</div>
      </div>
    );
  }

  if (problemState.status === "closed") {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0a0a] p-6">
        <div className="w-full max-w-2xl bg-[#111127] border border-red-500/30 rounded-2xl p-8">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-red-300 mb-2">
                Task Closed
              </p>
              <h1 className="text-2xl font-bold text-white">
                {problemState.problem.name}
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                {problemState.problem.points} pts
              </p>
            </div>
            <Link
              href={`/tracks/${trackId}`}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              ← Back to track
            </Link>
          </div>

          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-200 space-y-3">
            <p>
              This offline task has been closed for your account.
            </p>
            <p>
              Once the offline room connection is lost, the task cannot be reopened and no further work can be submitted.
            </p>
            {problemState.closedReason && (
              <p className="text-xs uppercase tracking-wide text-red-300/80">
                Reason: {formatOfflineClosedReason(problemState.closedReason)}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (problemState.status === "offline_confirmation") {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0a0a] p-6">
        <div className="w-full max-w-2xl bg-[#111127] border border-amber-500/30 rounded-2xl p-8">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-amber-300 mb-2">
                Offline Task
              </p>
              <h1 className="text-2xl font-bold text-white">
                {problemState.problem.name}
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                {problemState.problem.points} pts
              </p>
            </div>
            <Link
              href={`/tracks/${trackId}`}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              ← Back to track
            </Link>
          </div>

          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-100 space-y-3">
            {problemState.canStartOfflineTask ? (
              <>
                <p>
                  This task can only be started from the offline room.
                </p>
                <p>
                  You are on the offline room access link, so you can start it here.
                </p>
                <p>
                  Any lost connection immediately ends the task for you. Closing, refreshing, or leaving this page also counts as a disconnect.
                </p>
              </>
            ) : (
              <>
                <p>
                  You need to open this task from the offline room to start it.
                </p>
                <p>
                  Use the HTTP access link provided in the room, then come back to this task there.
                </p>
                <p>
                  After the task starts, leaving that page or losing the room connection closes it immediately.
                </p>
              </>
            )}
          </div>

          {!!problemState.problem.offlineTaskPreDescription?.trim() && (
            <div className="mt-4 p-4 rounded-xl bg-[#0d0d1d] border border-gray-800 text-sm text-gray-200">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-300 mb-2">
                Before Heading To The Offline Room
              </p>
              <p className="whitespace-pre-wrap leading-7">
                {problemState.problem.offlineTaskPreDescription}
              </p>
            </div>
          )}

          {offlineError && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
              {offlineError}
            </div>
          )}

          <div className="flex items-center gap-3 mt-6">
            {problemState.canStartOfflineTask && (
              <button
                onClick={startOfflineTask}
                disabled={isConnectingOffline}
                className="px-5 py-2.5 text-sm bg-amber-500 hover:bg-amber-400 disabled:bg-amber-700 text-black font-medium rounded-lg transition-colors"
              >
                {isConnectingOffline ? "Connecting..." : "Confirm and Start"}
              </button>
            )}
            <Link
              href={`/tracks/${trackId}`}
              className="px-5 py-2.5 text-sm bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors"
            >
              {problemState.canStartOfflineTask ? "Cancel" : "Back to track"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (languages === undefined || !problem) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-[#111127]">
        <div className="flex items-center gap-3">
          <Link
            href={`/tracks/${trackId}`}
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            ← {track.name}
          </Link>
          <span className="text-gray-600">|</span>
          <span className="text-white font-medium">{problem.name}</span>
          <span className="text-gray-500 text-xs">{problem.points} pts</span>
          {problem.isOffline && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 uppercase tracking-wide">
              Offline Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={langId}
            onChange={(e) => setLangId(e.target.value)}
            className="px-2 py-1.5 text-sm bg-gray-800 border border-gray-700 text-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {(languages || []).map((lang) => (
              <option key={lang.langId} value={lang.langId}>
                {lang.name}
              </option>
            ))}
          </select>
          <button
            onClick={runCode}
            disabled={isRunning || isSubmitting}
            className="px-4 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded-lg transition-colors"
          >
            {isRunning ? "Running..." : "Run ▶"}
          </button>
          <button
            onClick={submitCode}
            disabled={isRunning || isSubmitting}
            className="px-4 py-1.5 text-sm bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white rounded-lg transition-colors"
          >
            {isSubmitting ? "Submitting..." : "Submit ✓"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 border-r border-gray-800 overflow-auto p-4">
          <h2 className="text-lg font-semibold text-white mb-3">
            {problem.name}
          </h2>
          <div className="prose prose-invert prose-sm max-w-none">
            <p className="text-gray-300 whitespace-pre-wrap text-sm">
              {problem.description}
            </p>
          </div>

          {problem.sampleInput && (
            <div className="mt-4">
              <h4 className="text-xs font-semibold text-gray-400 uppercase mb-1">
                Sample Input
              </h4>
              <pre className="bg-[#1a1a2e] p-2 rounded text-xs text-gray-300 overflow-auto">
                {problem.sampleInput}
              </pre>
            </div>
          )}
          {problem.sampleOutput && (
            <div className="mt-3">
              <h4 className="text-xs font-semibold text-gray-400 uppercase mb-1">
                Sample Output
              </h4>
              <pre className="bg-[#1a1a2e] p-2 rounded text-xs text-gray-300 overflow-auto">
                {problem.sampleOutput}
              </pre>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-hidden">
            <CodeEditor value={code} onChange={setCode} language={codemirrorLang} />
          </div>

          <div className="h-28 border-t border-gray-800">
            <div className="px-3 py-1 border-b border-gray-800">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Input
              </span>
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full h-[calc(100%-28px)] bg-[#1e1e2e] text-gray-200 font-mono text-sm p-2 resize-none focus:outline-none"
              placeholder="Custom input..."
            />
          </div>
        </div>

        <div className="w-80 border-l border-gray-800 flex flex-col">
          <OutputPanel
            output={output}
            isError={isError}
            isLoading={isRunning || isSubmitting}
            loadingText={
              isRunning ? "Running code..." : "Evaluating submission..."
            }
            score={score}
            testResults={testResults}
          />
        </div>
      </div>
    </div>
  );
}