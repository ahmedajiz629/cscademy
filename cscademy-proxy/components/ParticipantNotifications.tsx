"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

function formatDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

const levelClasses: Record<string, string> = {
  info: "border-sky-500/30 bg-sky-500/10 text-sky-100",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-100",
};

export default function ParticipantNotifications({
  userId,
}: {
  userId: Id<"users">;
}) {
  const notifications = useQuery(api.notifications.listForUser, {
    userId,
    limit: 6,
  });
  const dismissNotification = useMutation(api.notifications.dismiss);
  const [closingId, setClosingId] = useState<string | null>(null);

  const visibleNotifications = useMemo(() => notifications ?? [], [notifications]);

  async function handleDismiss(notificationId: Id<"notifications">) {
    setClosingId(String(notificationId));
    try {
      await dismissNotification({ userId, notificationId });
    } finally {
      setClosingId(null);
    }
  }

  if (!notifications || visibleNotifications.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-gray-800 bg-[#0d0d1d]">
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Notifications</h2>
            <p className="text-xs text-gray-500 mt-1">
              Latest platform and task availability updates.
            </p>
          </div>
          <span className="text-xs text-gray-500">
            {visibleNotifications.length} active
          </span>
        </div>

        <div className="space-y-2">
          {visibleNotifications.map((notification) => (
            <article
              key={notification._id}
              className={`rounded-xl border p-4 ${levelClasses[notification.level] ?? levelClasses.info}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-white">
                      {notification.title}
                    </h3>
                    {notification.trackName && (
                      <span className="text-[10px] uppercase tracking-wide text-gray-300/70">
                        {notification.trackName}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-current/90">
                    {notification.message}
                  </p>
                  <p className="mt-3 text-xs text-current/70">
                    {formatDate(notification.createdAt)}
                  </p>
                </div>
                <button
                  onClick={() => handleDismiss(notification._id)}
                  disabled={closingId === String(notification._id)}
                  className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                >
                  {closingId === String(notification._id) ? "Hiding..." : "Dismiss"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}