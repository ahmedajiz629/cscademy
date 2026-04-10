"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { formatScore } from "@/lib/score-format";
import LeaderboardTable from "./LeaderboardTable";
import TrackLeaderboardPanel from "./TrackLeaderboardPanel";

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

export default function GlobalLeaderboardPanel() {
  const globalOptions = useQuery(api.leaderboards.getGlobalScopeOptions);
  const globalLeaderboard = useQuery(api.leaderboards.getGlobalLeaderboard);
  const [selectedScope, setSelectedScope] = useState("global");

  useEffect(() => {
    if (!globalOptions) {
      return;
    }

    if (selectedScope === "global") {
      return;
    }

    const exists = globalOptions.tracks.some((track) => track.trackSlug === selectedScope);
    if (!exists) {
      setSelectedScope("global");
    }
  }, [globalOptions, selectedScope]);

  if (globalOptions === undefined || globalLeaderboard === undefined) {
    return <div className="text-sm text-gray-500">Loading leaderboard...</div>;
  }

  if (!globalOptions.globalLeaderboardVisible) {
    return <div className="text-sm text-gray-500">The global leaderboard is disabled.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Leaderboards</h1>
          <p className="mt-1 text-sm text-gray-400">
            View the global ranking or drill into tracks and problem leaderboards that are currently enabled.
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
            <option value="global">Global Overall</option>
            {globalOptions.tracks.map((track) => (
              <option key={track.trackSlug} value={track.trackSlug}>
                {track.trackName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedScope === "global" ? (
        !globalLeaderboard ? (
          <div className="text-sm text-gray-500">The global leaderboard is disabled.</div>
        ) : (
          <LeaderboardTable
            entries={globalLeaderboard.entries}
            emptyMessage="No scored submissions exist yet."
            columns={[
              {
                key: "weightedScore",
                label: "Weighted Score",
                align: "right",
                render: (entry) => (
                  <span className="font-semibold text-white">{formatScore(entry.weightedScore)}</span>
                ),
              },
              {
                key: "rawScore",
                label: "Raw Score",
                align: "right",
                render: (entry) => formatScore(entry.rawScore),
              },
              {
                key: "activeTracks",
                label: "Tracks",
                align: "center",
                render: (entry) => entry.activeTracks,
              },
              {
                key: "lastAttemptAt",
                label: "Last Update",
                align: "right",
                render: (entry) => formatDate(entry.lastAttemptAt),
              },
            ]}
          />
        )
      ) : (
        <TrackLeaderboardPanel trackSlug={selectedScope} />
      )}
    </div>
  );
}