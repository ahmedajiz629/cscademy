import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireAdminOrService, requireSelfOrAdminOrService } from "./auth";
import { getTrackLabel, insertNotification } from "./notificationHelpers";

function sortNewestFirst<T extends { createdAt: number }>(entries: T[]) {
  return [...entries].sort((left, right) => right.createdAt - left.createdAt);
}

export const listForUser = query({
  args: { userId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, { userId, limit }) => {
    await requireSelfOrAdminOrService(ctx, userId);

    const user = await ctx.db.get(userId);
    if (!user) {
      return [];
    }

    const dismissed = await ctx.db
      .query("notificationDismissals")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const dismissedIds = new Set(dismissed.map((entry) => String(entry.notificationId)));

    const notifications = await ctx.db.query("notifications").collect();
    const visible = notifications.filter((notification) => {
      if (dismissedIds.has(String(notification._id))) {
        return false;
      }

      return (
        notification.targetRole === "all" || notification.targetRole === user.role
      );
    });

    return sortNewestFirst(visible)
      .slice(0, limit ?? 10)
      .map((notification) => ({
        ...notification,
        trackName: notification.trackSlug
          ? getTrackLabel(notification.trackSlug)
          : undefined,
      }));
  },
});

export const listAdmin = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    await requireAdminOrService(ctx);

    const notifications = await ctx.db.query("notifications").collect();

    return sortNewestFirst(notifications)
      .slice(0, limit ?? 50)
      .map((notification) => ({
        ...notification,
        trackName: notification.trackSlug
          ? getTrackLabel(notification.trackSlug)
          : undefined,
      }));
  },
});

export const createCustom = mutation({
  args: {
    title: v.string(),
    message: v.string(),
    level: v.union(
      v.literal("info"),
      v.literal("success"),
      v.literal("warning")
    ),
    targetRole: v.union(
      v.literal("student"),
      v.literal("admin"),
      v.literal("all")
    ),
    createdByUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const identity = await requireAdminOrService(ctx);

    return insertNotification(ctx, {
      title: args.title,
      message: args.message,
      kind: "custom",
      level: args.level,
      targetRole: args.targetRole,
      createdByUserId: identity.userId ?? args.createdByUserId,
    });
  },
});

export const dismiss = mutation({
  args: { userId: v.id("users"), notificationId: v.id("notifications") },
  handler: async (ctx, { userId, notificationId }) => {
    await requireSelfOrAdminOrService(ctx, userId);

    const existing = await ctx.db
      .query("notificationDismissals")
      .withIndex("by_user_notification", (q) =>
        q.eq("userId", userId).eq("notificationId", notificationId)
      )
      .first();

    if (existing) {
      return existing._id;
    }

    return ctx.db.insert("notificationDismissals", {
      userId,
      notificationId,
      dismissedAt: Date.now(),
    });
  },
});