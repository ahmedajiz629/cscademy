"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { getTrack } from "@/lib/tracks";

export default function AdminTrackDetailPage() {
  const params = useParams();
  const trackId = params.trackId as string;
  const track = getTrack(trackId);

  const problems = useQuery(api.trackProblems.listByTrack, {
    trackSlug: trackId,
  });
  const languages = useQuery(api.programmingLanguages.listByTrack, {
    trackSlug: trackId,
  });

  if (!track) {
    return <div className="p-8 text-gray-400">Track not found.</div>;
  }

  return (
    <div className="p-8">
      <div className="mb-4">
        <Link
          href="/admin/tracks"
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← Back to tracks
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">
          <span className="mr-2">{track.icon}</span>
          {track.name}
        </h1>
        <p className="text-sm text-gray-400 mt-1">{track.description}</p>
        <p className="text-xs text-gray-500 mt-2">
          Languages: {languages ? languages.map((l) => l.name).join(", ") : "Loading..."} &middot;
          Run: <code className="text-gray-400">{track.runEndpoint}</code> &middot;
          Submit: <code className="text-gray-400">{track.submitEndpoint}</code>
        </p>
      </div>

      {problems === undefined ? (
        <div className="text-gray-400">Loading problems...</div>
      ) : problems.length === 0 ? (
        <div className="text-gray-500 p-8 text-center border border-gray-800 rounded-xl">
          No problems seeded for this track.
        </div>
      ) : (
        <div className="border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#111127] border-b border-gray-800">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                  #
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                  Slug
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                  Task ID
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                  Points
                </th>
              </tr>
            </thead>
            <tbody>
              {problems.map((p) => (
                <tr
                  key={p._id}
                  className="border-b border-gray-800/50 hover:bg-[#111127]/50"
                >
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {p.order}
                  </td>
                  <td className="px-4 py-3 text-sm text-white">{p.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-400 font-mono">
                    {p.slug}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {p.contestTaskId}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {p.points}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
