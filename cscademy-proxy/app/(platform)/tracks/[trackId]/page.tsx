"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getTrack } from "@/lib/tracks";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function TrackDetailPage() {
  const params = useParams();
  const trackId = params.trackId as string;
  const [user, setUser] = useState<User | null>(null);

  const track = getTrack(trackId);
  const problems = useQuery(api.trackProblems.listByTrack, {
    trackSlug: trackId,
  });

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user))
      .catch(() => {});
  }, []);

  const scores = useQuery(
    api.scores.getByUserAndTrack,
    user?.id
      ? { userId: user.id as Id<"users">, trackSlug: trackId }
      : "skip"
  );

  if (!track) {
    return (
      <div className="p-8">
        <div className="text-gray-400">Track not found.</div>
      </div>
    );
  }

  const problemsList = problems || [];

  function getScore(problemSlug: string) {
    return scores?.find((s) => s.problemSlug === problemSlug);
  }

  const totalEarned = scores?.reduce((sum, s) => sum + s.score, 0) || 0;
  const totalPossible = problemsList.reduce((sum, p) => sum + p.points, 0);

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
            {totalEarned.toFixed(0)}
            <span className="text-gray-500 text-lg">/{totalPossible}</span>
          </p>
          <p className="text-xs text-gray-500">points</p>
        </div>
      </div>

      {problemsList.length === 0 ? (
        <div className="text-gray-500 p-8 text-center border border-gray-800 rounded-xl">
          {problems === undefined ? "Loading problems..." : "No problems in this track yet."}
        </div>
      ) : (
        <div className="space-y-2">
          {problemsList.map((problem, idx) => {
            const sc = getScore(problem.slug);
            const pct = sc ? (sc.score / problem.points) * 100 : 0;
            return (
              <Link
                key={problem.slug}
                href={`/tracks/${trackId}/problems/${problem.slug}`}
                className="flex items-center justify-between p-4 bg-[#111127] border border-gray-800 rounded-xl hover:border-blue-500/50 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <span className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-sm text-gray-400 font-mono">
                    {idx + 1}
                  </span>
                  <div>
                    <h3 className="text-white font-medium group-hover:text-blue-400 transition-colors">
                      {problem.name}
                    </h3>
                    <p className="text-gray-500 text-xs mt-0.5">
                      {problem.points} pts
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
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
                        {sc.score.toFixed(0)}/{problem.points}
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
