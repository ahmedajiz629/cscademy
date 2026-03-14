import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    return ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
  },
});

export const getById = query({
  args: { id: v.id("users") },
  handler: async (ctx, { id }) => {
    return ctx.db.get(id);
  },
});

export const list = query({
  handler: async (ctx) => {
    return ctx.db.query("users").collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    role: v.union(v.literal("admin"), v.literal("student")),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (existing) throw new Error("Email already exists");

    return ctx.db.insert("users", {
      ...args,
      isActive: true,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("users"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    passwordHash: v.optional(v.string()),
    role: v.optional(v.union(v.literal("admin"), v.literal("student"))),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...fields }) => {
    const clean: Record<string, any> = {};
    for (const [k, val] of Object.entries(fields)) {
      if (val !== undefined) clean[k] = val;
    }
    await ctx.db.patch(id, clean);
  },
});

export const remove = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, { id }) => {
    // Also remove linked CSA account
    const csa = await ctx.db
      .query("csacademyAccounts")
      .withIndex("by_userId", (q) => q.eq("userId", id))
      .first();
    if (csa) await ctx.db.delete(csa._id);
    // Remove scores
    const scores = await ctx.db
      .query("scores")
      .withIndex("by_user_track", (q) => q.eq("userId", id))
      .collect();
    for (const s of scores) await ctx.db.delete(s._id);
    await ctx.db.delete(id);
  },
});
