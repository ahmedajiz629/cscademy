"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { getAllTracks } from "@/lib/tracks";

const tracks = getAllTracks();

export default function AdminPage() {
  const users = useQuery(api.users.list, {});
  const scores = useQuery(api.scores.listAll, {});
  const platformSettings = useQuery(api.platformSettings.get);
  const setGlobalLeaderboardVisible = useMutation(
    api.platformSettings.setGlobalLeaderboardVisible
  );

  const activeTracks = tracks.filter((t) => t.isActive);
  const totalUsers = users?.length;
  const studentCount = users?.filter((user) => user.role === "student").length;
  const scoreCount = scores?.length;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-white mb-6">Admin Overview</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="p-5 bg-[#111127] border border-gray-800 rounded-xl">
          <p className="text-3xl font-bold text-white">{totalUsers ?? "–"}</p>
          <p className="text-sm text-gray-400 mt-1">Total Users</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {studentCount ?? 0} students
          </p>
        </div>
        <div className="p-5 bg-[#111127] border border-gray-800 rounded-xl">
          <p className="text-3xl font-bold text-white">{tracks.length}</p>
          <p className="text-sm text-gray-400 mt-1">Tracks</p>
          <p className="text-xs text-gray-500 mt-0.5">{activeTracks.length} active</p>
        </div>
        <div className="p-5 bg-[#111127] border border-gray-800 rounded-xl">
          <p className="text-3xl font-bold text-white">{scoreCount ?? "–"}</p>
          <p className="text-sm text-gray-400 mt-1">Submissions scored</p>
        </div>
      </div>

      <div className="p-5 bg-[#111127] border border-gray-800 rounded-xl max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Score Management</h2>
            <p className="text-sm text-gray-400 mt-1">
              Edit student scores from one dedicated place, including offline tasks.
            </p>
          </div>
          <Link
            href="/admin/scores"
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors whitespace-nowrap"
          >
            Manage Scores
          </Link>
        </div>
      </div>

      <div className="mt-6 p-5 bg-[#111127] border border-gray-800 rounded-xl max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Global Leaderboard</h2>
            <p className="text-sm text-gray-400 mt-1">
              Control the dedicated participant global leaderboard page and navigation item.
            </p>
          </div>
          <button
            onClick={() =>
              setGlobalLeaderboardVisible({
                visible: !(platformSettings?.globalLeaderboardVisible ?? false),
              })
            }
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
              platformSettings?.globalLeaderboardVisible ? "bg-green-500" : "bg-gray-600"
            }`}
            title={
              platformSettings?.globalLeaderboardVisible
                ? "Disable global leaderboard"
                : "Enable global leaderboard"
            }
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                platformSettings?.globalLeaderboardVisible
                  ? "translate-x-5"
                  : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="mt-6 p-5 bg-[#111127] border border-gray-800 rounded-xl max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Notifications</h2>
            <p className="text-sm text-gray-400 mt-1">
              Send custom alerts and review automatic opened or closed notices for tracks and tasks.
            </p>
          </div>
          <Link
            href="/admin/notifications"
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors whitespace-nowrap"
          >
            Manage Notifications
          </Link>
        </div>
      </div>
    </div>
  );
}
