"use client";

import Link from "next/link";
import { getAllTracks } from "@/lib/tracks";

const tracks = getAllTracks();

export default function AdminTracksPage() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Tracks</h1>
          <p className="text-sm text-gray-500 mt-1">
            Tracks are defined as code modules. Edit them in <code className="text-gray-400">lib/tracks/</code>.
          </p>
        </div>
      </div>

      <div className="border border-gray-800 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-[#111127] border-b border-gray-800">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                Track
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                Status
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                Problems
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                Languages
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                Details
              </th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((track) => (
              <tr
                key={track.id}
                className="border-b border-gray-800/50 hover:bg-[#111127]/50"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/tracks/${track.id}`}
                    className="text-sm text-white hover:text-blue-400 transition-colors"
                  >
                    <span className="mr-2">{track.icon}</span>
                    {track.name}
                  </Link>
                  <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">
                    {track.description}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs px-2 py-0.5 rounded ${
                      track.isActive
                        ? "bg-green-500/20 text-green-400"
                        : "bg-gray-500/20 text-gray-400"
                    }`}
                  >
                    {track.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-400">
                  {track.problems.length}
                </td>
                <td className="px-4 py-3 text-sm text-gray-400">
                  {track.languages.map((l) => l.name).join(", ")}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/tracks/${track.id}`}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    View →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
