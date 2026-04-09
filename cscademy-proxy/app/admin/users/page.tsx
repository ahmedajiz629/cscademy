"use client";

import { KeyboardEvent, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  OFFLINE_ANTI_CHEAT_REASON,
  isOfflineIncidentFlag,
} from "@/lib/offline-anti-cheat";

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: "admin" | "student";
  csaEmail: string;
  csaPassword: string;
}

const emptyForm: UserForm = {
  name: "",
  email: "",
  password: "",
  role: "student",
  csaEmail: "",
  csaPassword: "",
};

type OfflineSessionStatus = "pending" | "active" | "terminated";

const offlineSessionStatusOptions: Array<{
  value: OfflineSessionStatus;
  label: string;
}> = [
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "terminated", label: "Closed" },
];

const offlineIncidentOptions = [
  { value: "", label: "No incident" },
  { value: "connection_lost", label: "Connection lost" },
  { value: OFFLINE_ANTI_CHEAT_REASON, label: "Anti-cheat detected" },
];

function getStatusSelectClass(status: OfflineSessionStatus) {
  switch (status) {
    case "active":
      return "border-green-500/30 bg-green-500/10 text-green-300";
    case "terminated":
      return "border-red-500/30 bg-red-500/10 text-red-300";
    default:
      return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }
}

function getIncidentSelectClass(reason: string) {
  if (!reason) {
    return "border-gray-700 bg-[#1a1a2e] text-gray-300";
  }

  if (isOfflineIncidentFlag(reason)) {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }

  if (reason === "connection_lost") {
    return "border-red-500/30 bg-red-500/10 text-red-300";
  }

  return "border-sky-500/30 bg-sky-500/10 text-sky-300";
}

function getSessionIncidentValue(session: {
  flagReason?: string;
  terminatedReason?: string;
}) {
  const reason = session.flagReason ?? session.terminatedReason ?? "";
  return isOfflineIncidentFlag(reason) ? OFFLINE_ANTI_CHEAT_REASON : reason;
}

export default function AdminUsersPage() {
  const users = useQuery(api.users.list);
  const offlineSessions = useQuery(api.offlineProblemSessions.listAll);
  const createUser = useMutation(api.users.create);
  const updateUser = useMutation(api.users.update);
  const removeUser = useMutation(api.users.remove);
  const upsertCsa = useMutation(api.csacademyAccounts.upsert);
  const removeCsa = useMutation(api.csacademyAccounts.remove);
  const setOfflineSessionStatus = useMutation(api.offlineProblemSessions.setStatus);
  const setOfflineSessionIncident = useMutation(api.offlineProblemSessions.setIncident);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<Id<"users"> | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentSavingId, setCommentSavingId] = useState<Id<"users"> | null>(null);
  const [sessionStatusSavingId, setSessionStatusSavingId] =
    useState<Id<"offlineProblemSessions"> | null>(null);
  const [sessionIncidentSavingId, setSessionIncidentSavingId] =
    useState<Id<"offlineProblemSessions"> | null>(null);

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
    setError("");
  }

  function openEdit(user: any) {
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      csaEmail: "",
      csaPassword: "",
    });
    setEditingId(user._id as Id<"users">);
    setShowForm(true);
    setError("");

    // Load CSA account
    fetch(`/api/admin/csa-account?userId=${user._id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.csaEmail) {
          setForm((prev) => ({
            ...prev,
            csaEmail: d.csaEmail,
            csaPassword: d.csaPassword || "",
          }));
        }
      })
      .catch(() => {});
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      let userId: Id<"users">;
      const trimmedName = form.name.trim();
      const trimmedEmail = form.email.trim();

      if (editingId) {
        userId = editingId;
        const updates: any = {
          id: userId,
          name: trimmedName,
          email: trimmedEmail,
          role: form.role,
        };
        if (form.password) {
          // Hash password on server
          const hashRes = await fetch("/api/admin/hash-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: form.password }),
          });
          const hashData = await hashRes.json();
          updates.passwordHash = hashData.hash;
        }
        await updateUser(updates);
      } else {
        if (!form.password) {
          setError("Password is required for new users");
          setSaving(false);
          return;
        }
        // Hash password on server
        const hashRes = await fetch("/api/admin/hash-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: form.password }),
        });
        const hashData = await hashRes.json();

        userId = await createUser({
          name: trimmedName,
          email: trimmedEmail,
          passwordHash: hashData.hash,
          role: form.role,
        });
      }

      // Handle CSA account
      if (form.csaEmail && form.csaPassword) {
        await upsertCsa({
          userId,
          csaEmail: form.csaEmail,
          csaPassword: form.csaPassword,
        });
      } else if (editingId && !form.csaEmail) {
        await removeCsa({ userId });
      }

      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
    } catch (err: any) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: Id<"users">) {
    if (!confirm("Delete this user? This action cannot be undone.")) return;
    try {
      await removeUser({ id });
    } catch (err: any) {
      alert(err.message);
    }
  }

  async function handleCommentSave(
    id: Id<"users">,
    currentComment?: string
  ) {
    const draftValue = commentDrafts[id] ?? currentComment ?? "";
    const nextComment = draftValue.trim();
    const normalizedCurrentComment = (currentComment ?? "").trim();

    if (nextComment === normalizedCurrentComment) {
      return;
    }

    setCommentSavingId(id);
    try {
      await updateUser({ id, comment: nextComment });
      setCommentDrafts((prev) => {
        const nextDrafts = { ...prev };
        delete nextDrafts[id];
        return nextDrafts;
      });
    } catch (err: any) {
      alert(err.message || "Failed to save comment");
    } finally {
      setCommentSavingId(null);
    }
  }

  function handleCommentKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  async function handleSessionStatusChange(
    id: Id<"offlineProblemSessions">,
    status: OfflineSessionStatus
  ) {
    setSessionStatusSavingId(id);
    try {
      await setOfflineSessionStatus({ id, status });
    } catch (err: any) {
      alert(err.message || "Failed to update session status");
    } finally {
      setSessionStatusSavingId(null);
    }
  }

  async function handleSessionIncidentChange(
    id: Id<"offlineProblemSessions">,
    incidentReason: string
  ) {
    setSessionIncidentSavingId(id);
    try {
      await setOfflineSessionIncident({ id, incidentReason });
    } catch (err: any) {
      alert(err.message || "Failed to update incident");
    } finally {
      setSessionIncidentSavingId(null);
    }
  }

  const userNameById = new Map((users ?? []).map((user) => [user._id, user.name]));

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          + Add User
        </button>
      </div>

      {/* User form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-[#111127] border border-gray-800 rounded-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-white mb-4">
              {editingId ? "Edit User" : "Create User"}
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg">
                {error}
              </div>
            )}

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
                <label className="block text-sm text-gray-400 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3 py-2 bg-[#1a1a2e] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Password {editingId && "(leave blank to keep current)"}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3 py-2 bg-[#1a1a2e] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Role</label>
                <select
                  value={form.role}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      role: e.target.value as "admin" | "student",
                    })
                  }
                  className="w-full px-3 py-2 bg-[#1a1a2e] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="student">Student</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="pt-3 border-t border-gray-800">
                <p className="text-xs text-gray-500 mb-2">
                  Evaluation Account (linked transparently)
                </p>
                <div className="flex gap-2">
                  <input
                    value={form.csaEmail}
                    onChange={(e) =>
                      setForm({ ...form, csaEmail: e.target.value })
                    }
                    placeholder="Judge email or username"
                    className="flex-1 px-3 py-2 bg-[#1a1a2e] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    type="password"
                    value={form.csaPassword}
                    onChange={(e) =>
                      setForm({ ...form, csaPassword: e.target.value })
                    }
                    placeholder="Judge password"
                    className="flex-1 px-3 py-2 bg-[#1a1a2e] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                  setForm(emptyForm);
                }}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg transition-colors"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users table */}
      {!users ? (
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
                  Email
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                  Comment
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                  Role
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                  Status
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user._id}
                  className="border-b border-gray-800/50 hover:bg-[#111127]/50"
                >
                  <td className="px-4 py-3 text-sm text-white">{user.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {user.email}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400 min-w-[18rem]">
                    <div className="space-y-1">
                      <input
                        value={commentDrafts[user._id] ?? user.comment ?? ""}
                        onChange={(e) =>
                          setCommentDrafts((prev) => ({
                            ...prev,
                            [user._id]: e.target.value,
                          }))
                        }
                        onBlur={() => void handleCommentSave(user._id, user.comment)}
                        onKeyDown={handleCommentKeyDown}
                        placeholder="Add comment"
                        className="w-full px-3 py-2 bg-[#1a1a2e] border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      {commentSavingId === user._id && (
                        <p className="text-xs text-gray-500">Saving comment...</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        user.role === "admin"
                          ? "bg-purple-500/20 text-purple-400"
                          : "bg-blue-500/20 text-blue-400"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs ${
                        user.isActive ? "text-green-400" : "text-gray-500"
                      }`}
                    >
                      {user.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openEdit(user)}
                      className="text-xs text-blue-400 hover:text-blue-300 mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(user._id)}
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

      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Offline Task Sessions</h2>
            <p className="text-sm text-gray-500 mt-1">
              Edit status and incident labels inline for each offline task session.
            </p>
          </div>
        </div>

        {!offlineSessions ? (
          <div className="text-gray-400">Loading sessions...</div>
        ) : offlineSessions.length === 0 ? (
          <div className="text-gray-500 p-6 border border-gray-800 rounded-xl">
            No offline task sessions yet.
          </div>
        ) : (
          <div className="border border-gray-800 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-[#111127] border-b border-gray-800">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Student
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Task
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Incident
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody>
                {offlineSessions.map((session) => {
                  const incidentValue = getSessionIncidentValue(session);
                  return (
                    <tr
                      key={session._id}
                      className="border-b border-gray-800/50 hover:bg-[#111127]/50"
                    >
                      <td className="px-4 py-3 text-sm text-white">
                        {userNameById.get(session.userId) ?? "Unknown user"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        <span className="font-mono text-xs text-gray-300">
                          {session.trackSlug}/{session.problemSlug}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        <select
                          value={session.status}
                          onChange={(e) =>
                            void handleSessionStatusChange(
                              session._id,
                              e.target.value as OfflineSessionStatus
                            )
                          }
                          disabled={sessionStatusSavingId === session._id}
                          className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 ${getStatusSelectClass(
                            session.status
                          )}`}
                        >
                          {offlineSessionStatusOptions.map((option) => (
                            <option
                              key={option.value}
                              value={option.value}
                              className="bg-[#111127] text-white"
                            >
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-400">
                        <select
                          value={incidentValue}
                          onChange={(e) =>
                            void handleSessionIncidentChange(
                              session._id,
                              e.target.value
                            )
                          }
                          disabled={sessionIncidentSavingId === session._id}
                          className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 ${getIncidentSelectClass(
                            incidentValue
                          )}`}
                        >
                          {offlineIncidentOptions.map((option) => (
                            <option
                              key={option.value || "none"}
                              value={option.value}
                              className="bg-[#111127] text-white"
                            >
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        <div>{new Date(session.updatedAt).toLocaleString()}</div>
                        {(sessionStatusSavingId === session._id ||
                          sessionIncidentSavingId === session._id) && (
                          <div className="text-xs text-gray-600 mt-1">Saving…</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
