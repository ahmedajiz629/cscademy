"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const tracks = useQuery(api.tracks.listActive);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user))
      .catch(() => {});
  }, []);

  const scores = useQuery(
    api.scores.getAllByUser,
    user?.id ? { userId: user.id as Id<"users"> } : "skip"
  );

  // Calculate track scores
  function getTrackScore(trackId: string) {
    if (!scores) return { earned: 0, total: 0 };
    const trackScores = scores.filter((s) => s.trackId === trackId);
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

      {!tracks ? (
        <div className="text-gray-400">Loading tracks...</div>
      ) : tracks.length === 0 ? (
        <div className="text-gray-500 p-8 text-center border border-gray-800 rounded-xl">
          No tracks available yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tracks.map((track) => {
            const { earned, count } = getTrackScore(track._id);
            return (
              <Link
                key={track._id}
                href={`/tracks/${track._id}`}
                className="block p-5 bg-[#111127] border border-gray-800 rounded-xl hover:border-blue-500/50 transition-colors group"
              >
                <h3 className="text-white font-semibold group-hover:text-blue-400 transition-colors">
                  {track.name}
                </h3>
                <p className="text-gray-400 text-sm mt-1 line-clamp-2">
                  {track.description}
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {count} problem{count !== 1 ? "s" : ""} solved
                  </span>
                  {earned > 0 && (
                    <span className="text-xs text-green-400">
                      {earned.toFixed(0)} pts
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
