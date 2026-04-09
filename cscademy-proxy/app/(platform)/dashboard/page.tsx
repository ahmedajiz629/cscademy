"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatScore } from "@/lib/score-format";
import { getAllTracks } from "@/lib/tracks";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

const allTracks = getAllTracks();

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user))
      .catch(() => {});
  }, []);

  const trackSettings = useQuery(api.trackSettings.list);
  const scores = useQuery(
    api.scores.getAllByUser,
    user?.id ? { userId: user.id as Id<"users"> } : "skip"
  );

  // Resolve effective isActive: DB override → code default
  const tracks = allTracks.filter((t) => {
    const override = trackSettings?.find((s) => s.trackSlug === t.id);
    return override !== undefined ? override.isActive : t.isActive;
  });

  function getTrackScore(trackSlug: string) {
    if (!scores) return { earned: 0, count: 0 };
    const trackScores = scores.filter((s) => s.trackSlug === trackSlug);
    const earned = trackScores.reduce((sum, s) => sum + s.score, 0);
    return { earned, count: trackScores.length };
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-1">Dashboard</h1>
      <p className="text-gray-400 mb-8">
        Welcome back{user ? `, ${user.name}` : ""}
      </p>

      <h2 className="text-lg font-semibold text-white mb-4">Your Tracks</h2>

      {tracks.length === 0 ? (
        <div className="text-gray-500 p-8 text-center border border-gray-800 rounded-xl">
          No tracks available yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tracks.map((track) => {
            const { earned, count } = getTrackScore(track.id);
            return (
              <Link
                key={track.id}
                href={`/tracks/${track.id}`}
                className="block p-5 bg-[#111127] border border-gray-800 rounded-xl hover:border-blue-500/50 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{track.icon}</span>
                  <h3 className="text-white font-semibold group-hover:text-blue-400 transition-colors">
                    {track.name}
                  </h3>
                </div>
                <p className="text-gray-400 text-sm mt-1 line-clamp-2">
                  {track.description}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    Problems
                  </span>
                  <span className="text-xs text-gray-500">
                    {count} solved
                  </span>
                  {earned > 0 && (
                    <span className="text-xs text-green-400">
                      {formatScore(earned)} pts
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
