"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatScore } from "@/lib/score-format";
import { getTrack } from "@/lib/tracks";
import { isOfflineSessionStale } from "@/lib/offline-session";
import TrackLeaderboardPanel from "@/components/leaderboards/TrackLeaderboardPanel";

interface TrackProblemListItem {
  slug: string;
  name: string;
  points: number;
  isOffline: boolean;
  offlineStatus: "ready" | "pending" | "active" | "closed" | null;
}

export default function TrackDetailPage() {
  const params = useParams();
  const trackId = params.trackId as string;
  const [now, setNow] = useState(() => Date.now());
  const [activeTab, setActiveTab] = useState<"problems" | "leaderboard">("problems");

  const track = getTrack(trackId);
  const problems = useQuery(api.trackProblems.listByTrack, { trackSlug: trackId });
  const leaderboardOptions = useQuery(api.leaderboards.getTrackScopeOptions, {
    trackSlug: trackId,
  });
  const sessions = useQuery(api.offlineProblemSessions.listMineByTrack, {
    trackSlug: trackId,
  });
  const scores = useQuery(api.scores.getMineByTrack, { trackSlug: trackId });

  useEffect(() => {
    if (!(sessions || []).some((session) => session.status === "active")) {
      setNow(Date.now());
      return;
    }

    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [sessions]);

  const problemsList = useMemo<TrackProblemListItem[] | null>(() => {
    if (!problems) {
      return null;
    }

    const sessionByProblem = new Map(
      (sessions || []).map((session) => [session.problemSlug, session])
    );

    return problems.map<TrackProblemListItem>((problem) => {
      if (problem.isOffline !== true) {
        return {
          slug: problem.slug,
          name: problem.name,
          points: problem.points,
          isOffline: false,
          offlineStatus: null,
        };
      }

      const session = sessionByProblem.get(problem.slug);
      const offlineStatus: TrackProblemListItem["offlineStatus"] =
        session?.status === "terminated" || isOfflineSessionStale(session, now)
          ? "closed"
          : session?.status === "active"
            ? "active"
            : session?.status === "pending"
              ? "pending"
              : "ready";

      return {
        slug: problem.slug,
        name: problem.name,
        points: problem.points,
        isOffline: true,
        offlineStatus,
      };
    });
  }, [now, problems, sessions]);

  if (!track) {
    return (
      <div className="p-8">
        <div className="text-gray-400">Checking track...</div>
      </div>
    );
  }

  function getScore(problemSlug: string) {
    return scores?.find((s) => s.problemSlug === problemSlug);
  }

  const resolvedProblems = problemsList || [];
  const totalEarned = scores?.reduce((sum, s) => sum + s.score, 0) || 0;
  const totalPossible = resolvedProblems.reduce((sum, p) => sum + p.points, 0);
  const hasLeaderboard = (leaderboardOptions?.options.length ?? 0) > 0;

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link
          href="/tracks"
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← Back to tracks
        </Link>
      </div>

      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{track.icon}</span>
            <h1 className="text-2xl font-bold text-white">{track.name}</h1>
          </div>
          <p className="text-gray-400 mt-1">{track.description}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-white">
            {formatScore(totalEarned)}
            <span className="text-gray-500 text-lg">/{totalPossible}</span>
          </p>
          <p className="text-xs text-gray-500">points</p>
        </div>
      </div>

      {hasLeaderboard && (
        <div className="mb-6 flex items-center gap-2 border-b border-gray-800">
          <button
            onClick={() => setActiveTab("problems")}
            className={`rounded-t-xl px-4 py-2 text-sm transition-colors ${
              activeTab === "problems"
                ? "bg-[#111127] text-white"
                : "text-gray-500 hover:text-white"
            }`}
          >
            Problems
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

      {activeTab === "leaderboard" && hasLeaderboard ? (
        <TrackLeaderboardPanel trackSlug={trackId} />
      ) : problemsList === null ? (
        <div className="text-gray-500 p-8 text-center border border-gray-800 rounded-xl">
          Loading problems...
        </div>
      ) : resolvedProblems.length === 0 ? (
        <div className="text-gray-500 p-8 text-center border border-gray-800 rounded-xl">
          No problems in this track yet.
        </div>
      ) : (
        <div className="space-y-2">
          {resolvedProblems.map((problem, idx) => {
            const sc = getScore(problem.slug);
            const pct = sc ? (sc.score / problem.points) * 100 : 0;
            return (
              <Link
                key={problem.slug}
                href={track.buildProblemPath(problem.slug)}
                className="flex items-center justify-between p-4 bg-[#111127] border border-gray-800 rounded-xl hover:border-blue-500/50 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <span className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-sm text-gray-400 font-mono">
                    {idx + 1}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-medium group-hover:text-blue-400 transition-colors">
                        {problem.name}
                      </h3>
                      {problem.isOffline && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 uppercase tracking-wide">
                          Offline
                        </span>
                      )}
                    </div>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {problem.points} pts
                      {problem.isOffline && " · requires live LAN connection"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {problem.isOffline && problem.offlineStatus && (
                    <span
                      className={`text-[10px] uppercase tracking-wide ${
                        problem.offlineStatus === "closed"
                          ? "text-red-400"
                          : "text-gray-500"
                      }`}
                    >
                      {problem.offlineStatus}
                    </span>
                  )}
                  {sc && (
                    <>
                      <span
                        className={`text-sm font-medium ${
                          pct >= 100
                            ? "text-green-400"
                            : pct > 0
                              ? "text-yellow-400"
                              : "text-gray-500"
                        }`}
                      >
                        {formatScore(sc.score)}/{problem.points}
                      </span>
                      <span className="text-xs text-gray-600">
                        {sc.attempts} attempt{sc.attempts !== 1 ? "s" : ""}
                      </span>
                    </>
                  )}
                  <span className="text-gray-600 group-hover:text-gray-400 transition-colors">
                    →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
