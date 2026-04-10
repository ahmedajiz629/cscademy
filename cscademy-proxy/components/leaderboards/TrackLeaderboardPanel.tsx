"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatScore } from "@/lib/score-format";
import LeaderboardTable from "./LeaderboardTable";
import ProblemLeaderboardPanel from "./ProblemLeaderboardPanel";

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

export default function TrackLeaderboardPanel({
  trackSlug,
}: {
  trackSlug: string;
}) {
  const optionsData = useQuery(api.leaderboards.getTrackScopeOptions, { trackSlug });
  const [selectedScope, setSelectedScope] = useState("track");

  useEffect(() => {
    if (!optionsData?.options.length) {
      return;
    }

    const hasSelectedScope = optionsData.options.some((option) => option.key === selectedScope);
    if (!hasSelectedScope) {
      setSelectedScope(optionsData.options[0].key);
    }
  }, [optionsData, selectedScope]);

  const selectedProblemSlug = useMemo(() => {
    if (!selectedScope.startsWith("problem:")) {
      return null;
    }

    return selectedScope.slice("problem:".length);
  }, [selectedScope]);

  const trackLeaderboard = useQuery(
    api.leaderboards.getTrackLeaderboard,
    selectedScope === "track" ? { trackSlug } : "skip"
  );

  if (optionsData === undefined) {
    return <div className="text-sm text-gray-500">Loading leaderboard...</div>;
  }

  if (optionsData.options.length === 0) {
    return <div className="text-sm text-gray-500">No leaderboard is enabled for this track yet.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">{optionsData.trackName} Leaderboard</h2>
          <p className="mt-1 text-sm text-gray-400">
            Pick the full track ranking or one of the problem leaderboards enabled for this track.
          </p>
        </div>
        <div className="w-full sm:w-80">
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-500">
            Scope
          </label>
          <select
            value={selectedScope}
            onChange={(event) => setSelectedScope(event.target.value)}
            className="w-full rounded-xl border border-gray-700 bg-[#111127] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {optionsData.options.map((option) => (
              <option key={option.key} value={option.key}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedProblemSlug ? (
        <ProblemLeaderboardPanel trackSlug={trackSlug} problemSlug={selectedProblemSlug} />
      ) : trackLeaderboard === undefined ? (
        <div className="text-sm text-gray-500">Loading leaderboard...</div>
      ) : !trackLeaderboard ? (
        <div className="text-sm text-gray-500">This track leaderboard is disabled.</div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-800 bg-[#111127] p-4 text-sm text-gray-300">
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Coefficient</p>
                <p className="mt-1 text-base font-semibold text-white">
                  {formatScore(trackLeaderboard.coefficient)}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Problems</p>
                <p className="mt-1 text-base font-semibold text-white">
                  {trackLeaderboard.problemCount}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Points Available</p>
                <p className="mt-1 text-base font-semibold text-white">
                  {formatScore(trackLeaderboard.pointsAvailable)}
                </p>
              </div>
            </div>
          </div>

          <LeaderboardTable
            entries={trackLeaderboard.entries}
            emptyMessage="No scored submissions exist for this track yet."
            columns={[
              {
                key: "score",
                label: "Track Score",
                align: "right",
                render: (entry) => <span className="font-semibold text-white">{formatScore(entry.score)}</span>,
              },
              {
                key: "solvedProblems",
                label: "Solved",
                align: "center",
                render: (entry) => entry.solvedProblems,
              },
              {
                key: "attempts",
                label: "Attempts",
                align: "center",
                render: (entry) => entry.attempts,
              },
              {
                key: "lastAttemptAt",
                label: "Last Update",
                align: "right",
                render: (entry) => formatDate(entry.lastAttemptAt),
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}