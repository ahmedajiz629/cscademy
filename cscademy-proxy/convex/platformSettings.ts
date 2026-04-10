import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdminOrService } from "./auth";

const PLATFORM_SETTINGS_KEY = "global";

export const get = query({
  handler: async (ctx) => {
    const settings = await ctx.db
      .query("platformSettings")
      .withIndex("by_key", (q) => q.eq("key", PLATFORM_SETTINGS_KEY))
      .first();

    return {
      globalLeaderboardVisible: settings?.globalLeaderboardVisible ?? false,
    };
  },
});

export const setGlobalLeaderboardVisible = mutation({
  args: { visible: v.boolean() },
  handler: async (ctx, { visible }) => {
    await requireAdminOrService(ctx);

    const existing = await ctx.db
      .query("platformSettings")
      .withIndex("by_key", (q) => q.eq("key", PLATFORM_SETTINGS_KEY))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { globalLeaderboardVisible: visible });
      return existing._id;
    }

    return ctx.db.insert("platformSettings", {
      key: PLATFORM_SETTINGS_KEY,
      globalLeaderboardVisible: visible,
    });
  },
});