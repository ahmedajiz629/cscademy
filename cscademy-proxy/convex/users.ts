import { v } from "convex/values";
import bcrypt from "bcryptjs";
import { query, mutation } from "./_generated/server";
import {
  requireAdminOrService,
  requireIdentity,
  requireSelfOrAdminOrService,
  requireService,
} from "./auth";

const SALT_ROUNDS = 10;

function serializeUser(user: any) {
  if (!user) {
    return null;
  }

  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

async function resolvePasswordHash(args: {
  password?: string;
  passwordHash?: string;
}) {
  const password = args.password?.trim();
  if (password) {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  const passwordHash = args.passwordHash?.trim();
  if (passwordHash) {
    return passwordHash;
  }

  throw new Error("Password is required");
}

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);

    if (!identity.userId) {
      return null;
    }

    return serializeUser(await ctx.db.get(identity.userId));
  },
});

export const getByEmail = query({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    await requireService(ctx);

    return ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
  },
});

export const getById = query({
  args: { id: v.id("users") },
  handler: async (ctx, { id }) => {
    await requireSelfOrAdminOrService(ctx, id);
    return serializeUser(await ctx.db.get(id));
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdminOrService(ctx);
    const users = await ctx.db.query("users").collect();
    return users.map(serializeUser);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    password: v.optional(v.string()),
    passwordHash: v.optional(v.string()),
    role: v.union(v.literal("admin"), v.literal("student")),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdminOrService(ctx);

    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (existing) throw new Error("Email already exists");

    return ctx.db.insert("users", {
      name: args.name,
      email: args.email,
      passwordHash: await resolvePasswordHash(args),
      role: args.role,
      comment: args.comment,
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
    password: v.optional(v.string()),
    passwordHash: v.optional(v.string()),
    role: v.optional(v.union(v.literal("admin"), v.literal("student"))),
    isActive: v.optional(v.boolean()),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, { id, password, passwordHash, ...fields }) => {
    await requireAdminOrService(ctx);

    const clean: Record<string, any> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        clean[key] = value;
      }
    }

    if (password?.trim() || passwordHash?.trim()) {
      clean.passwordHash = await resolvePasswordHash({
        password,
        passwordHash,
      });
    }

    await ctx.db.patch(id, clean);
  },
});

export const remove = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, { id }) => {
    await requireAdminOrService(ctx);

    const csa = await ctx.db
      .query("csacademyAccounts")
      .withIndex("by_userId", (q) => q.eq("userId", id))
      .first();
    if (csa) await ctx.db.delete(csa._id);

    const scores = await ctx.db
      .query("scores")
      .withIndex("by_user_track", (q) => q.eq("userId", id))
      .collect();
    for (const score of scores) {
      await ctx.db.delete(score._id);
    }

    await ctx.db.delete(id);
  },
});
