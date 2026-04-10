import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdminOrService } from "./auth";

export const listByTrack = query({
  args: { trackSlug: v.string() },
  handler: async (ctx, { trackSlug }) => {
    const langs = await ctx.db
      .query("programmingLanguages")
      .withIndex("by_trackSlug", (q) => q.eq("trackSlug", trackSlug))
      .collect();
    return langs.sort((a, b) => a.order - b.order);
  },
});

export const create = mutation({
  args: {
    trackSlug: v.string(),
    langId: v.string(),
    name: v.string(),
    codemirrorMode: v.string(),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdminOrService(ctx);
    return ctx.db.insert("programmingLanguages", args);
  },
});

export const clearByTrack = mutation({
  args: { trackSlug: v.string() },
  handler: async (ctx, { trackSlug }) => {
    await requireAdminOrService(ctx);

    const langs = await ctx.db
      .query("programmingLanguages")
      .withIndex("by_trackSlug", (q) => q.eq("trackSlug", trackSlug))
      .collect();
    for (const l of langs) {
      await ctx.db.delete(l._id);
    }
    return langs.length;
  },
});
