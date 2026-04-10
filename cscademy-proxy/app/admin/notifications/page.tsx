"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

const audienceOptions = [
  { value: "student", label: "Students" },
  { value: "admin", label: "Admins" },
  { value: "all", label: "Everyone" },
] as const;

const levelOptions = [
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
] as const;

export default function AdminNotificationsPage() {
  const notifications = useQuery(api.notifications.listAdmin, { limit: 50 });
  const createCustomNotification = useMutation(api.notifications.createCustom);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [targetRole, setTargetRole] = useState<(typeof audienceOptions)[number]["value"]>(
    "student"
  );
  const [level, setLevel] = useState<(typeof levelOptions)[number]["value"]>("info");
  const [saving, setSaving] = useState(false);

  const recentNotifications = useMemo(() => notifications ?? [], [notifications]);

  async function handleCreateNotification() {
    if (!title.trim() || !message.trim()) {
      alert("Title and message are required.");
      return;
    }

    setSaving(true);
    try {
      await createCustomNotification({
        title,
        message,
        targetRole,
        level,
      });

      setTitle("");
      setMessage("");
      setTargetRole("student");
      setLevel("info");
    } catch (error: any) {
      alert(error.message || "Failed to create notification.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Notifications</h1>
        <p className="text-sm text-gray-400 mt-1">
          Broadcast manual alerts and review automatic availability updates.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-6 items-start">
        <section className="p-5 bg-[#111127] border border-gray-800 rounded-xl space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Custom Alert</h2>
            <p className="text-xs text-gray-500 mt-1">
              Use this for announcements that are not directly caused by track or task availability changes.
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Audience</label>
            <select
              value={targetRole}
              onChange={(event) =>
                setTargetRole(event.target.value as (typeof audienceOptions)[number]["value"])
              }
              className="w-full px-3 py-2 text-sm bg-[#1a1a2e] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {audienceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Level</label>
            <select
              value={level}
              onChange={(event) =>
                setLevel(event.target.value as (typeof levelOptions)[number]["value"])
              }
              className="w-full px-3 py-2 text-sm bg-[#1a1a2e] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {levelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Title</label>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#1a1a2e] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Example: Offline room starts in 10 minutes"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Message</label>
            <textarea
              rows={5}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="w-full px-3 py-2 text-sm bg-[#1a1a2e] border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
              placeholder="Describe the alert participants should see."
            />
          </div>

          <button
            onClick={handleCreateNotification}
            disabled={saving}
            className="w-full px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
          >
            {saving ? "Sending..." : "Send Alert"}
          </button>
        </section>

        <section className="p-5 bg-[#111127] border border-gray-800 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Recent Notifications</h2>
              <p className="text-xs text-gray-500 mt-1">
                Includes both manual alerts and automatic task or track availability updates.
              </p>
            </div>
            <div className="text-xs text-gray-500">
              {recentNotifications.length} shown
            </div>
          </div>

          {notifications === undefined ? (
            <div className="py-10 text-center text-gray-500">Loading notifications...</div>
          ) : recentNotifications.length === 0 ? (
            <div className="py-10 text-center text-gray-500">No notifications yet.</div>
          ) : (
            <div className="space-y-3">
              {recentNotifications.map((notification) => (
                <article
                  key={notification._id}
                  className="rounded-xl border border-gray-800 bg-[#0d0d1d] p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-white">
                          {notification.title}
                        </h3>
                        <span className="text-[10px] uppercase tracking-wide text-gray-500">
                          {notification.kind.replaceAll("_", " ")}
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-300">
                        {notification.message}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase tracking-wide text-gray-500 whitespace-nowrap">
                      {notification.targetRole}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                    <span>
                      {notification.trackName
                        ? `${notification.trackName}${notification.problemSlug ? ` / ${notification.problemSlug}` : ""}`
                        : "Platform-wide"}
                    </span>
                    <span>{formatDate(notification.createdAt)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}