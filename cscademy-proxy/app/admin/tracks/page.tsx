"use client";

import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { getAllTracks } from "@/lib/tracks";

const tracks = getAllTracks();

export default function AdminTracksPage() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Tracks</h1>
          <p className="text-sm text-gray-500 mt-1">
            Track list is defined in code. Enable/disable and content (problems,
            languages) are managed here.
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
                Active
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                Problems
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                Languages
              </th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                Manage
              </th>
            </tr>
          </thead>
          <tbody>
            {tracks.map((track) => (
              <TrackRow key={track.id} track={track} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TrackRow({ track }: { track: ReturnType<typeof getAllTracks>[0] }) {
  const problems = useQuery(api.trackProblems.listByTrack, {
    trackSlug: track.id,
  });
  const languages = useQuery(api.programmingLanguages.listByTrack, {
    trackSlug: track.id,
  });
  const settings = useQuery(api.trackSettings.getBySlug, {
    trackSlug: track.id,
  });
  const setActive = useMutation(api.trackSettings.setActive);

  // Effective active state: DB override → code default
  const isActive =
    settings !== undefined
      ? (settings?.isActive ?? track.isActive)
      : track.isActive;

  return (
    <tr className="border-b border-gray-800/50 hover:bg-[#111127]/50">
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
        <button
          onClick={() => setActive({ trackSlug: track.id, isActive: !isActive })}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
            isActive ? "bg-green-500" : "bg-gray-600"
          }`}
          title={isActive ? "Click to disable" : "Click to enable"}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
              isActive ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </td>
      <td className="px-4 py-3 text-sm text-gray-400">
        {problems?.length ?? "–"}
      </td>
      <td className="px-4 py-3 text-sm text-gray-400">
        {languages ? languages.length : "–"}
      </td>
      <td className="px-4 py-3 text-right">
        <Link
          href={`/admin/tracks/${track.id}`}
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          Edit →
        </Link>
      </td>
    </tr>
  );
}
