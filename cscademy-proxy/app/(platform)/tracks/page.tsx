"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function TracksPage() {
  const tracks = useQuery(api.tracks.listActive);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-6">Tracks</h1>

      {!tracks ? (
        <div className="text-gray-400">Loading...</div>
      ) : tracks.length === 0 ? (
        <div className="text-gray-500 p-8 text-center border border-gray-800 rounded-xl">
          No tracks available yet.
        </div>
      ) : (
        <div className="space-y-3">
          {tracks.map((track) => (
            <Link
              key={track._id}
              href={`/tracks/${track._id}`}
              className="block p-5 bg-[#111127] border border-gray-800 rounded-xl hover:border-blue-500/50 transition-colors group"
            >
              <h3 className="text-white font-semibold group-hover:text-blue-400 transition-colors">
                {track.name}
              </h3>
              <p className="text-gray-400 text-sm mt-1">{track.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
