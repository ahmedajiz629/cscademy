import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const list = query({
  handler: async (ctx) => {
    return ctx.db.query("tracks").collect();
  },
});

export const listActive = query({
  handler: async (ctx) => {
    const all = await ctx.db.query("tracks").collect();
    return all.filter((t) => t.isActive).sort((a, b) => a.order - b.order);
  },
});

export const getById = query({
  args: { id: v.id("tracks") },
  handler: async (ctx, { id }) => {
    return ctx.db.get(id);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    order: v.number(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("tracks", {
      ...args,
      isActive: true,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("tracks"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    order: v.optional(v.number()),
  },
  handler: async (ctx, { id, ...fields }) => {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined) clean[k] = v;
    }
    await ctx.db.patch(id, clean);
  },
});

export const remove = mutation({
  args: { id: v.id("tracks") },
  handler: async (ctx, { id }) => {
    // Remove track problems
    const problems = await ctx.db
      .query("trackProblems")
      .withIndex("by_trackId", (q) => q.eq("trackId", id))
      .collect();
    for (const p of problems) await ctx.db.delete(p._id);
    // Remove scores for this track
    const scores = await ctx.db
      .query("scores")
      .withIndex("by_user_track")
      .collect();
    for (const s of scores) {
      if (s.trackId === id) await ctx.db.delete(s._id);
    }
    await ctx.db.delete(id);
  },
});
