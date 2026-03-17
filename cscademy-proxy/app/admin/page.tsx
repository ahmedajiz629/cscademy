"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { getAllTracks } from "@/lib/tracks";

const tracks = getAllTracks();

export default function AdminPage() {
  const users = useQuery(api.users.list);
  const scores = useQuery(api.scores.listAll);

  const studentCount = users?.filter((u) => u.role === "student").length ?? 0;
  const activeTracks = tracks.filter((t) => t.isActive);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-6">Admin Overview</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="p-5 bg-[#111127] border border-gray-800 rounded-xl">
          <p className="text-3xl font-bold text-white">{users?.length ?? "–"}</p>
          <p className="text-sm text-gray-400 mt-1">Total Users</p>
          <p className="text-xs text-gray-500 mt-0.5">{studentCount} students</p>
        </div>
        <div className="p-5 bg-[#111127] border border-gray-800 rounded-xl">
          <p className="text-3xl font-bold text-white">{tracks.length}</p>
          <p className="text-sm text-gray-400 mt-1">Tracks</p>
          <p className="text-xs text-gray-500 mt-0.5">{activeTracks.length} active</p>
        </div>
        <div className="p-5 bg-[#111127] border border-gray-800 rounded-xl">
          <p className="text-3xl font-bold text-white">{scores?.length ?? "–"}</p>
          <p className="text-sm text-gray-400 mt-1">Submissions scored</p>
        </div>
      </div>
    </div>
  );
}
