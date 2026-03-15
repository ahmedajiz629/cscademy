import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Platform users (admin & student)
  users: defineTable({
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    role: v.union(v.literal("admin"), v.literal("student")),
    isActive: v.boolean(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  // Linked CSAcademy accounts (one per user, hidden from students)
  csacademyAccounts: defineTable({
    userId: v.id("users"),
    csaEmail: v.string(),
    csaPassword: v.string(),
  }).index("by_userId", ["userId"]),

  // User scores per problem (tracks & problems are code modules, referenced by slug)
  scores: defineTable({
    userId: v.id("users"),
    trackSlug: v.string(),
    problemSlug: v.string(),
    score: v.number(),
    attempts: v.number(),
    lastAttemptAt: v.number(),
  })
    .index("by_user_track", ["userId", "trackSlug"])
    .index("by_user_problem", ["userId", "problemSlug"]),
});
