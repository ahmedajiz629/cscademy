"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import track from "@/lib/tracks/algorithmics";
import { formatScore } from "@/lib/score-format";
import {
  buildOfflineProbeUrl,
  formatOfflineClosedReason,
  OFFLINE_ANTI_CHEAT_RETRY_INTERVAL_MS,
} from "@/lib/offline-anti-cheat";
import {
  canStartOfflineTaskFromUrl,
} from "@/lib/offline-gateway";
import { isOfflineSessionStale } from "@/lib/offline-session";
import OutputPanel from "@/components/OutputPanel";
import ProblemLeaderboardPanel from "@/components/leaderboards/ProblemLeaderboardPanel";

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
  sampleTests?: Array<{ input?: string; output?: string }>;
  starterCode?: string;
  isOffline?: boolean;
  offlineTaskPreDescription?: string;
  leaderboardVisible?: boolean;
  probeImageUrl?: string;
}

interface OfflineProblemPreview {
  slug: string;
  name: string;
  points: number;
  isOffline: true;
  offlineTaskPreDescription?: string;
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
  const [runtimeConfig, setRuntimeConfig] = useState<OfflineRuntimeConfig | null>(null);

  const languages = useQuery(api.programmingLanguages.listByTrack, {
    trackSlug: trackId,
  });
  const problemRecord = useQuery(api.trackProblems.getBySlug, {
    trackSlug: trackId,
    slug: problemId,
  });
  const scoreRecord = useQuery(api.scores.getMineByProblem, {
    trackSlug: trackId,
    problemSlug: problemId,
  });
  const session = useQuery(api.offlineProblemSessions.getMineByUserAndProblem, {
    trackSlug: trackId,
    problemSlug: problemId,
  });

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
  const [activeTab, setActiveTab] = useState<"workspace" | "leaderboard">("workspace");
  const [optimisticClosedState, setOptimisticClosedState] = useState<
    | {
        problem: OfflineProblemPreview;
        closedReason?: string;
      }
    | null
  >(null);
  const [now, setNow] = useState(() => Date.now());

  const [descWidth, setDescWidth] = useState(320);
  const [outputWidth, setOutputWidth] = useState(320);
  const [inputHeight, setInputHeight] = useState(140);

  const socketRef = useRef<WebSocket | null>(null);
  const offlineStartedRef = useRef(false);
  const probeRetryTimeoutRef = useRef<number | null>(null);
  const probeImageRef = useRef<HTMLImageElement | null>(null);
  const pendingCloseReasonRef = useRef<string | null>(null);
  const probeTriggeredRef = useRef(false);
  const codeDraftsRef = useRef<Record<string, string>>({});
  const inputSeedKeyRef = useRef("");
  const dragRef = useRef<{
    which: "desc" | "output" | "input";
    startX: number;
    startY: number;
    startVal: number;
  } | null>(null);

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

  // Drag-to-resize panel listeners (attached once, driven by dragRef)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.which === "desc") {
        setDescWidth(Math.max(160, Math.min(600, drag.startVal + e.clientX - drag.startX)));
      } else if (drag.which === "output") {
        setOutputWidth(Math.max(160, Math.min(600, drag.startVal - (e.clientX - drag.startX))));
      } else {
        setInputHeight(Math.max(60, Math.min(400, drag.startVal - (e.clientY - drag.startY))));
      }
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
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
    codeDraftsRef.current = {};
    inputSeedKeyRef.current = "";
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
    if (problemRecord === undefined) {
      return { status: "loading" };
    }

    if (!problemRecord) {
      return { status: "not_found" };
    }

    if (problemRecord.isOffline !== true) {
      return { status: "ready", problem: problemRecord };
    }

    if (session === undefined) {
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
    now,
    optimisticClosedState,
    problemRecord,
    runtimeConfig,
    session,
  ]);

  const problem = problemState.status === "ready" ? problemState.problem : null;
  const defaultLangId = languages?.[0]?.langId || "1";
  const problemCodeSeedKey = problem
    ? `${problem.slug}:${problem.starterCode ?? ""}`
    : "";
  const problemInputSeedKey = problem
    ? `${problem.slug}:${problem.sampleTests?.[0]?.input ?? ""}`
    : "";

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
    if (!problemCodeSeedKey || !langId) {
      return;
    }

    const draftKey = `${problemCodeSeedKey}:${langId}`;
    const existingDraft = codeDraftsRef.current[draftKey];

    if (existingDraft !== undefined) {
      setCode(existingDraft);
      return;
    }

    const starter = starterCodeMap[langId] || starterCodeMap[defaultLangId] || "";
    codeDraftsRef.current[draftKey] = starter;
    setCode(starter);
  }, [problemCodeSeedKey, langId, defaultLangId, starterCodeMap]);

  useEffect(() => {
    if (!problemInputSeedKey || inputSeedKeyRef.current === problemInputSeedKey) {
      return;
    }

    inputSeedKeyRef.current = problemInputSeedKey;
    setInput(problem?.sampleTests?.[0]?.input ?? "");
  }, [problem?.sampleTests, problemInputSeedKey]);

  const handleCodeChange = useCallback(
    (nextCode: string) => {
      setCode(nextCode);

      if (!problemCodeSeedKey || !langId) {
        return;
      }

      codeDraftsRef.current[`${problemCodeSeedKey}:${langId}`] = nextCode;
    },
    [langId, problemCodeSeedKey]
  );

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

  const runCode = useCallback(async (inputOverride?: string) => {
    if (!problem) return;
    const runInput = inputOverride !== undefined ? inputOverride : input;
    if (inputOverride !== undefined) setInput(inputOverride);
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
          input: runInput,
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
          const stats: string[] = [];
          if (typeof results.time === "number") stats.push(`${results.time}ms`);
          if (typeof results.maxMemory === "number") stats.push(`${Math.round(results.maxMemory / 1024)} KB`);
          const footer = stats.length > 0 ? `\n\n⏱ ${stats.join(" · ")}` : "";
          setOutput((stdout || "(no output)") + (stderr ? "\n--- stderr ---\n" + stderr : "") + footer);
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
    setTestResults([]);
    setIsError(false);
    setScore(null);

    try {
      const res = await fetch("/api/evaluation/submit-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackSlug: trackId,
          problemSlug: problemId,
          sourceCode: code,
          programmingLanguageId: langId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Submission failed" }));
        setOutput(errData.error || "Submission failed");
        setIsError(true);
        setIsSubmitting(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setOutput("No response stream from server");
        setIsError(true);
        setIsSubmitting(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      const accumulated: any[] = [];

      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const msg = JSON.parse(line.slice(6));
            if (msg.type === "test") {
              accumulated.push(msg.test);
              setTestResults([...accumulated]);
            } else if (msg.type === "done") {
              const sc = msg.score !== null && msg.score !== undefined ? msg.score : null;
              setScore(sc);
              const passed = accumulated.filter((t: any) => t.checkerScore === 1).length;
              const summary: string[] = [];
              if (sc !== null) summary.push(`Score: ${formatScore(sc)}/${problem.points}`);
              summary.push(`Tests: ${passed}/${accumulated.length} passed`);
              setOutput(summary.join("\n") || "Submitted successfully");
              setIsSubmitting(false);
              break outer;
            } else if (msg.type === "error") {
              setOutput(msg.message || "Evaluation failed");
              setIsError(true);
              setIsSubmitting(false);
              break outer;
            }
          } catch {
            // Ignore malformed SSE line
          }
        }
      }
    } catch (err: any) {
      setOutput(err.message || "Submission failed");
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
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to start offline task");
      }

      if (typeof data.gatewayUrl !== "string") {
        throw new Error("Offline gateway URL missing from server response");
      }

      const wsUrl = new URL(data.gatewayUrl);
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

  if (languages === undefined || scoreRecord === undefined || !problem) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0a0a]">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  const bestScore = scoreRecord?.score ?? null;
  const bestScoreClassName =
    bestScore === null
      ? "text-gray-500"
      : bestScore >= problem.points
        ? "text-green-400"
        : bestScore > 0
          ? "text-yellow-400"
          : "text-gray-500";

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
          <span className="text-gray-600">·</span>
          <span className="text-xs text-gray-500">
            Best:{" "}
            <span className={`font-bold ${bestScoreClassName}`}>
              {bestScore !== null ? `${formatScore(bestScore)}/${problem.points}` : "—"}
            </span>
          </span>
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
            onClick={() => runCode()}
            disabled={isRunning || isSubmitting}
            className="px-4 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded-lg transition-colors"
          >
            {isRunning ? "Running..." : "Run ▶"}
          </button>
          {problem.sampleTests && problem.sampleTests.length > 0 && problem.sampleTests[0]?.input && (
            <button
              onClick={() => runCode(problem.sampleTests![0].input || "")}
              disabled={isRunning || isSubmitting}
              className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-gray-300 rounded-lg transition-colors"
              title="Load first example input and run"
            >
              ▶ Sample
            </button>
          )}
          <button
            onClick={submitCode}
            disabled={isRunning || isSubmitting}
            className="px-4 py-1.5 text-sm bg-green-600 hover:bg-green-700 disabled:bg-green-800 text-white rounded-lg transition-colors"
          >
            {isSubmitting ? "Submitting..." : "Submit ✓"}
          </button>
        </div>
      </div>

      {problem.leaderboardVisible && (
        <div className="flex items-center gap-2 border-b border-gray-800 bg-[#0a0a0a] px-4 pt-3">
          <button
            onClick={() => setActiveTab("workspace")}
            className={`rounded-t-xl px-4 py-2 text-sm transition-colors ${
              activeTab === "workspace"
                ? "bg-[#111127] text-white"
                : "text-gray-500 hover:text-white"
            }`}
          >
            Workspace
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
        <div className="flex-1 overflow-auto p-8">
          <ProblemLeaderboardPanel trackSlug={track.id} problemSlug={problemId} />
        </div>
      ) : (

      <div className="flex-1 flex overflow-hidden">
        {/* ── Description panel (resizable) ── */}
        <div
          style={{ width: descWidth, minWidth: 160 }}
          className="border-r border-gray-800 overflow-auto p-4 flex-shrink-0"
        >
          <h2 className="text-lg font-semibold text-white mb-3">
            {problem.name}
          </h2>
          <div className="prose prose-invert prose-sm max-w-none">
            <p className="text-gray-300 whitespace-pre-wrap text-sm">
              {problem.description}
            </p>
          </div>

          {problem.sampleTests && problem.sampleTests.length > 0 && problem.sampleTests.map((example, idx) => (
            <div key={idx} className="mt-4">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-xs font-semibold text-gray-400 uppercase">
                  Example {idx + 1}
                </h4>
                <button
                  onClick={() => runCode(example.input || "")}
                  disabled={isRunning || isSubmitting}
                  className="text-xs text-blue-400 hover:text-blue-300 disabled:text-gray-600 transition-colors"
                  title={`Run with example ${idx + 1} input`}
                >
                  ▶ Run
                </button>
              </div>
              {example.input !== undefined && (
                <div>
                  <span className="text-[10px] text-gray-500 uppercase tracking-wide">Input</span>
                  <pre className="bg-[#1a1a2e] p-2 rounded text-xs text-gray-300 overflow-auto mt-0.5">
                    {example.input}
                  </pre>
                </div>
              )}
              {example.output !== undefined && (
                <div className="mt-1">
                  <span className="text-[10px] text-gray-500 uppercase tracking-wide">Output</span>
                  <pre className="bg-[#1a1a2e] p-2 rounded text-xs text-gray-300 overflow-auto mt-0.5">
                    {example.output}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Drag handle: desc ↔ editor ── */}
        <div
          className="w-1 cursor-col-resize bg-gray-800 hover:bg-blue-500 active:bg-blue-500 transition-colors flex-shrink-0"
          onMouseDown={(e) => {
            e.preventDefault();
            dragRef.current = { which: "desc", startX: e.clientX, startY: e.clientY, startVal: descWidth };
          }}
        />

        {/* ── Editor + Input (flex-1) ── */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-hidden">
            <CodeEditor
              value={code}
              onChange={handleCodeChange}
              language={codemirrorLang}
            />
          </div>

          {/* ── Drag handle: editor ↔ input ── */}
          <div
            className="h-1 cursor-row-resize bg-gray-800 hover:bg-blue-500 active:bg-blue-500 transition-colors flex-shrink-0"
            onMouseDown={(e) => {
              e.preventDefault();
              dragRef.current = { which: "input", startX: e.clientX, startY: e.clientY, startVal: inputHeight };
            }}
          />

          {/* ── Input panel (resizable height) ── */}
          <div
            style={{ height: inputHeight }}
            className="border-t border-gray-800 flex flex-col flex-shrink-0"
          >
            <div className="px-3 py-1 border-b border-gray-800 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Input
              </span>
              {problem.sampleTests && problem.sampleTests.length > 0 && problem.sampleTests[0]?.input && (
                <button
                  type="button"
                  onClick={() => setInput(problem.sampleTests![0].input || "")}
                  className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                  title="Load first example input"
                >
                  ↺ Load Sample
                </button>
              )}
            </div>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1 bg-[#1e1e2e] text-gray-200 font-mono text-sm p-2 resize-none focus:outline-none"
              placeholder="Custom input..."
            />
          </div>
        </div>

        {/* ── Drag handle: editor ↔ output ── */}
        <div
          className="w-1 cursor-col-resize bg-gray-800 hover:bg-blue-500 active:bg-blue-500 transition-colors flex-shrink-0"
          onMouseDown={(e) => {
            e.preventDefault();
            dragRef.current = { which: "output", startX: e.clientX, startY: e.clientY, startVal: outputWidth };
          }}
        />

        {/* ── Output panel (resizable) ── */}
        <div
          style={{ width: outputWidth, minWidth: 160 }}
          className="border-l border-gray-800 flex flex-col flex-shrink-0"
        >
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
      )}
    </div>
  );
}