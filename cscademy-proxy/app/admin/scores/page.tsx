"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatScore } from "@/lib/score-format";
import { getAllTracks } from "@/lib/tracks";

const tracks = getAllTracks();

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

export default function AdminScoresPage() {
  const users = useQuery(api.users.list);
  const problems = useQuery(api.trackProblems.listAllAdmin);
  const scores = useQuery(api.scores.listDetailedAdmin);
  const setExactScore = useMutation(api.scores.setExact);

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedProblemKey, setSelectedProblemKey] = useState("");
  const [scoreInput, setScoreInput] = useState("");
  const [saving, setSaving] = useState(false);

  const problemOptions = useMemo(() => {
    return (problems ?? []).map((problem) => {
      const track = tracks.find((item) => item.id === problem.trackSlug);
      return {
        key: `${problem.trackSlug}:${problem.slug}`,
        trackSlug: problem.trackSlug,
        slug: problem.slug,
        name: problem.name,
        points: problem.points,
        isOffline: problem.isOffline === true,
        label: `${track?.name ?? problem.trackSlug} / ${problem.name}`,
      };
    });
  }, [problems]);

  const selectedProblem = useMemo(
    () => problemOptions.find((problem) => problem.key === selectedProblemKey) ?? null,
    [problemOptions, selectedProblemKey]
  );

  const existingScore = useMemo(() => {
    if (!selectedUserId || !selectedProblem) {
      return null;
    }

    return (
      scores?.find(
        (entry) =>
          entry.userId === selectedUserId &&
          entry.trackSlug === selectedProblem.trackSlug &&
          entry.problemSlug === selectedProblem.slug
      ) ?? null
    );
  }, [scores, selectedProblem, selectedUserId]);

  useEffect(() => {
    if (!users?.length || selectedUserId) {
      return;
    }

    const firstStudent = users.find((user) => user.role === "student") ?? users[0];
    if (firstStudent) {
      setSelectedUserId(firstStudent._id);
    }
  }, [selectedUserId, users]);

  useEffect(() => {
    if (!problemOptions.length || selectedProblemKey) {
      return;
    }

    setSelectedProblemKey(problemOptions[0].key);
  }, [problemOptions, selectedProblemKey]);

  useEffect(() => {
    if (!selectedProblem) {
      setScoreInput("");
      return;
    }

    if (existingScore) {
      setScoreInput(String(existingScore.score));
      return;
    }

    setScoreInput("0");
  }, [existingScore, selectedProblem]);

  const recentScores = useMemo(() => {
    return [...(scores ?? [])]
      .sort((left, right) => right.lastAttemptAt - left.lastAttemptAt)
      .slice(0, 25);
  }, [scores]);

  async function handleSave() {
    if (!selectedUserId || !selectedProblem) {
      return;
    }

    const parsedScore = Number(scoreInput);
    if (!Number.isFinite(parsedScore)) {
      alert("Enter a valid numeric score.");
      return;
    }

    setSaving(true);
    try {
      await setExactScore({
        userId: selectedUserId as Id<"users">,
        trackSlug: selectedProblem.trackSlug,
        problemSlug: selectedProblem.slug,
        score: parsedScore,
      });
    } catch (error: any) {
      alert(error.message || "Failed to update score.");
    } finally {
      setSaving(false);
    }
  }

  function populateFromExistingScore(entry: {
    userId: Id<"users">;
    trackSlug: string;
    problemSlug: string;
    score: number;
  }) {
    setSelectedUserId(entry.userId);
    setSelectedProblemKey(`${entry.trackSlug}:${entry.problemSlug}`);
    setScoreInput(String(entry.score));
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Scores</h1>
        <p className="text-sm text-gray-400 mt-1">
          Edit any recorded score or create one manually for regular and offline tasks.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-6 items-start">
        <section className="p-5 bg-[#111127] border border-gray-800 rounded-xl space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Score Editor</h2>
            <p className="text-xs text-gray-500 mt-1">
              Manual edits write an exact score. Offline tasks are marked in the selector.
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Student</label>
            <select
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#1a1a2e] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {(users ?? [])
                .filter((user) => user.role === "student")
                .map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.name} ({user.email})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Problem</label>
            <select
              value={selectedProblemKey}
              onChange={(event) => setSelectedProblemKey(event.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#1a1a2e] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {problemOptions.map((problem) => (
                <option key={problem.key} value={problem.key}>
                  {problem.label}
                  {problem.isOffline ? " [Offline]" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Score</label>
            <input
              type="number"
              min={0}
              max={selectedProblem?.points ?? 100}
              value={scoreInput}
              onChange={(event) => setScoreInput(event.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#1a1a2e] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Maximum for this problem: {selectedProblem?.points ?? "—"}
            </p>
          </div>

          <div className="p-3 rounded-lg border border-gray-800 bg-[#0d0d1d] text-sm space-y-1">
            <p className="text-gray-400">
              Current stored score:{" "}
              <span className="text-white">
                {existingScore ? formatScore(existingScore.score) : "No score yet"}
              </span>
            </p>
            <p className="text-gray-500">
              Attempts: {existingScore?.attempts ?? 0}
            </p>
            <p className="text-gray-500">
              Last updated: {existingScore ? formatDate(existingScore.lastAttemptAt) : "—"}
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !selectedUserId || !selectedProblem}
            className="w-full px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
          >
            {saving ? "Saving…" : "Save Score"}
          </button>
        </section>

        <section className="p-5 bg-[#111127] border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Recent Score Records</h2>
              <p className="text-xs text-gray-500 mt-1">
                Quick-load an existing record into the editor.
              </p>
            </div>
            <div className="text-xs text-gray-500">
              {scores?.length ?? 0} total records
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-gray-800 text-left">
                  <th className="px-3 py-2 text-xs font-semibold uppercase text-gray-400">Student</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase text-gray-400">Track</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase text-gray-400">Problem</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase text-gray-400">Mode</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase text-gray-400">Score</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase text-gray-400">Attempts</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase text-gray-400">Updated</th>
                  <th className="px-3 py-2 text-xs font-semibold uppercase text-gray-400 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {recentScores.map((entry) => {
                  const track = tracks.find((item) => item.id === entry.trackSlug);
                  return (
                    <tr key={entry._id} className="border-b border-gray-800/60 hover:bg-[#16162b]">
                      <td className="px-3 py-2 text-sm text-white">
                        <div>{entry.userName}</div>
                        <div className="text-xs text-gray-500">{entry.userEmail}</div>
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-300">
                        {track?.name ?? entry.trackSlug}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-300">
                        <div>{entry.problemName}</div>
                        <div className="text-xs text-gray-500">
                          {entry.problemSlug} · max {entry.problemPoints}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-sm">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-xs ${
                            entry.isOfflineProblem
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-sky-500/20 text-sky-300"
                          }`}
                        >
                          {entry.isOfflineProblem ? "Offline" : "Online"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-sm text-white">
                        {formatScore(entry.score)}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-400">{entry.attempts}</td>
                      <td className="px-3 py-2 text-sm text-gray-400">
                        {formatDate(entry.lastAttemptAt)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => populateFromExistingScore(entry)}
                          className="px-3 py-1 text-xs text-blue-300 border border-blue-400/30 hover:border-blue-300 hover:text-blue-200 rounded transition-colors"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}