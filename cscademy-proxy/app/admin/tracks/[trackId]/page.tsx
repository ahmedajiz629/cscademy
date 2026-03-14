"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface ProblemForm {
  name: string;
  slug: string;
  contestTaskId: number;
  description: string;
  points: number;
  order: number;
  sampleInput: string;
  sampleOutput: string;
  starterCode: string;
  referer: string;
}

const emptyProblem: ProblemForm = {
  name: "",
  slug: "",
  contestTaskId: 0,
  description: "",
  points: 100,
  order: 0,
  sampleInput: "",
  sampleOutput: "",
  starterCode: '#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n',
  referer: "",
};

export default function AdminTrackDetailPage() {
  const params = useParams();
  const trackId = params.trackId as string;

  const track = useQuery(api.tracks.getById, {
    id: trackId as Id<"tracks">,
  });
  const problems = useQuery(api.trackProblems.listByTrack, {
    trackId: trackId as Id<"tracks">,
  });
  const createProblem = useMutation(api.trackProblems.create);
  const updateProblem = useMutation(api.trackProblems.update);
  const removeProblem = useMutation(api.trackProblems.remove);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProblemForm>(emptyProblem);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setForm({
      ...emptyProblem,
      order: (problems?.length || 0) + 1,
    });
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(p: any) {
    setForm({
      name: p.name,
      slug: p.slug,
      contestTaskId: p.contestTaskId,
      description: p.description,
      points: p.points,
      order: p.order,
      sampleInput: p.sampleInput || "",
      sampleOutput: p.sampleOutput || "",
      starterCode: p.starterCode || "",
      referer: p.referer || "",
    });
    setEditingId(p._id);
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editingId) {
        await updateProblem({
          id: editingId as Id<"trackProblems">,
          ...form,
          sampleInput: form.sampleInput || undefined,
          sampleOutput: form.sampleOutput || undefined,
          starterCode: form.starterCode || undefined,
          referer: form.referer || undefined,
        });
      } else {
        await createProblem({
          trackId: trackId as Id<"tracks">,
          ...form,
          sampleInput: form.sampleInput || undefined,
          sampleOutput: form.sampleOutput || undefined,
          starterCode: form.starterCode || undefined,
          referer: form.referer || undefined,
        });
      }
      setShowForm(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this problem?")) return;
    await removeProblem({ id: id as Id<"trackProblems"> });
  }

  if (!track) {
    return (
      <div className="p-8 text-gray-400">Loading...</div>
    );
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

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{track.name}</h1>
          <p className="text-sm text-gray-400">{track.description}</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          + Add Problem
        </button>
      </div>

      {/* Problem form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-10 overflow-auto">
          <div className="bg-[#111127] border border-gray-800 rounded-xl w-full max-w-2xl p-6 mb-10">
            <h2 className="text-lg font-semibold text-white mb-4">
              {editingId ? "Edit Problem" : "Add Problem"}
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Name</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 bg-[#1a1a2e] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Slug (CSA task name)
                </label>
                <input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="e.g. addition"
                  className="w-full px-3 py-2 bg-[#1a1a2e] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Contest Task ID
                </label>
                <input
                  type="number"
                  value={form.contestTaskId}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      contestTaskId: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-2 bg-[#1a1a2e] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Points
                </label>
                <input
                  type="number"
                  value={form.points}
                  onChange={(e) =>
                    setForm({ ...form, points: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-[#1a1a2e] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Order
                </label>
                <input
                  type="number"
                  value={form.order}
                  onChange={(e) =>
                    setForm({ ...form, order: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-[#1a1a2e] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Referer URL (optional)
                </label>
                <input
                  value={form.referer}
                  onChange={(e) =>
                    setForm({ ...form, referer: e.target.value })
                  }
                  placeholder="https://csacademy.com/contest/..."
                  className="w-full px-3 py-2 bg-[#1a1a2e] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-sm text-gray-400 mb-1">
                Description
              </label>
              <textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={4}
                className="w-full px-3 py-2 bg-[#1a1a2e] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Sample Input
                </label>
                <textarea
                  value={form.sampleInput}
                  onChange={(e) =>
                    setForm({ ...form, sampleInput: e.target.value })
                  }
                  rows={3}
                  className="w-full px-3 py-2 bg-[#1a1a2e] border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Sample Output
                </label>
                <textarea
                  value={form.sampleOutput}
                  onChange={(e) =>
                    setForm({ ...form, sampleOutput: e.target.value })
                  }
                  rows={3}
                  className="w-full px-3 py-2 bg-[#1a1a2e] border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-sm text-gray-400 mb-1">
                Starter Code (optional)
              </label>
              <textarea
                value={form.starterCode}
                onChange={(e) =>
                  setForm({ ...form, starterCode: e.target.value })
                }
                rows={4}
                className="w-full px-3 py-2 bg-[#1a1a2e] border border-gray-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Problems list */}
      {!problems ? (
        <div className="text-gray-400">Loading...</div>
      ) : problems.length === 0 ? (
        <div className="text-gray-500 p-8 text-center border border-gray-800 rounded-xl">
          No problems yet. Add your first problem to this track.
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
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {problems.map((p) => (
                <tr
                  key={p._id}
                  className="border-b border-gray-800/50 hover:bg-[#111127]/50"
                >
                  <td className="px-4 py-3 text-sm text-gray-500">{p.order}</td>
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
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEdit(p)}
                      className="text-xs text-blue-400 hover:text-blue-300 mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(p._id)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
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
