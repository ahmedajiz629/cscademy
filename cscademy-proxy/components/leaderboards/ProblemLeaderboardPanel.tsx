"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import LeaderboardTable from "./LeaderboardTable";
import { formatScore } from "@/lib/score-format";

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

export default function ProblemLeaderboardPanel({
  trackSlug,
  problemSlug,
}: {
  trackSlug: string;
  problemSlug: string;
}) {
  const leaderboard = useQuery(api.leaderboards.getProblemLeaderboard, {
    trackSlug,
    problemSlug,
  });

  if (leaderboard === undefined) {
    return <div className="text-sm text-gray-500">Loading leaderboard...</div>;
  }

  if (!leaderboard) {
    return <div className="text-sm text-gray-500">This problem leaderboard is disabled.</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">{leaderboard.problemName} Leaderboard</h2>
        <p className="mt-1 text-sm text-gray-400">
          Ranked by problem score. Earlier successful submissions break ties.
        </p>
      </div>

      <LeaderboardTable
        entries={leaderboard.entries}
        emptyMessage="No submissions have been scored for this problem yet."
        columns={[
          {
            key: "score",
            label: "Score",
            align: "right",
            render: (entry) => (
              <span className="font-semibold text-white">
                {formatScore(entry.score)}/{leaderboard.points}
              </span>
            ),
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
  );
}