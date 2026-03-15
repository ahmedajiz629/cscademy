"use client";

import Link from "next/link";
import { getAllTracks } from "@/lib/tracks";

const tracks = getAllTracks(true);

export default function TracksPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-6">Tracks</h1>

      {tracks.length === 0 ? (
        <div className="text-gray-500 p-8 text-center border border-gray-800 rounded-xl">
          No tracks available yet.
        </div>
      ) : (
        <div className="space-y-3">
          {tracks.map((track) => (
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
              <p className="text-gray-400 text-sm mt-1">{track.description}</p>
              <p className="text-xs text-gray-500 mt-2">
                {track.problems.length} problem{track.problems.length !== 1 ? "s" : ""}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
