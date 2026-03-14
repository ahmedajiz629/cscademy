"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export default function AdminTracksPage() {
  const tracks = useQuery(api.tracks.list);
  const createTrack = useMutation(api.tracks.create);
  const updateTrack = useMutation(api.tracks.update);
  const removeTrack = useMutation(api.tracks.remove);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", order: 0 });
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setForm({ name: "", description: "", order: (tracks?.length || 0) + 1 });
    setEditingId(null);
    setShowForm(true);
  }

  function openEdit(track: any) {
    setForm({
      name: track.name,
      description: track.description,
      order: track.order,
    });
    setEditingId(track._id);
    setShowForm(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editingId) {
        await updateTrack({
          id: editingId as Id<"tracks">,
          name: form.name,
          description: form.description,
          order: form.order,
        });
      } else {
        await createTrack({
          name: form.name,
          description: form.description,
          order: form.order,
        });
      }
      setShowForm(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(track: any) {
    await updateTrack({
      id: track._id as Id<"tracks">,
      isActive: !track.isActive,
    });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this track and all its problems? Cannot be undone."))
      return;
    await removeTrack({ id: id as Id<"tracks"> });
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Tracks</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          + Add Track
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-[#111127] border border-gray-800 rounded-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              {editingId ? "Edit Track" : "Create Track"}
            </h2>
            <div className="space-y-3">
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
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                  rows={3}
                  className="w-full px-3 py-2 bg-[#1a1a2e] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
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

      {!tracks ? (
        <div className="text-gray-400">Loading...</div>
      ) : (
        <div className="border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#111127] border-b border-gray-800">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                  Order
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {tracks
                .sort((a, b) => a.order - b.order)
                .map((track) => (
                  <tr
                    key={track._id}
                    className="border-b border-gray-800/50 hover:bg-[#111127]/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/tracks/${track._id}`}
                        className="text-sm text-white hover:text-blue-400 transition-colors"
                      >
                        {track.name}
                      </Link>
                      <p className="text-xs text-gray-500 mt-0.5 truncate max-w-xs">
                        {track.description}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActive(track)}
                        className={`text-xs px-2 py-0.5 rounded cursor-pointer ${
                          track.isActive
                            ? "bg-green-500/20 text-green-400"
                            : "bg-gray-500/20 text-gray-400"
                        }`}
                      >
                        {track.isActive ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {track.order}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/tracks/${track._id}`}
                        className="text-xs text-blue-400 hover:text-blue-300 mr-3"
                      >
                        Problems
                      </Link>
                      <button
                        onClick={() => openEdit(track)}
                        className="text-xs text-blue-400 hover:text-blue-300 mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(track._id)}
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
