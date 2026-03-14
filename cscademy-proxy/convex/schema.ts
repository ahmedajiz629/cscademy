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

  // Learning tracks / test series
  tracks: defineTable({
    name: v.string(),
    description: v.string(),
    isActive: v.boolean(),
    order: v.number(),
    createdAt: v.number(),
  }),

  // Problems within a track
  trackProblems: defineTable({
    trackId: v.id("tracks"),
    name: v.string(),
    slug: v.string(),
    contestTaskId: v.number(),
    description: v.string(),
    points: v.number(),
    order: v.number(),
    sampleInput: v.optional(v.string()),
    sampleOutput: v.optional(v.string()),
    starterCode: v.optional(v.string()),
    referer: v.optional(v.string()),
  }).index("by_trackId", ["trackId"]),

  // User scores per problem
  scores: defineTable({
    userId: v.id("users"),
    trackId: v.id("tracks"),
    problemId: v.id("trackProblems"),
    score: v.number(),
    attempts: v.number(),
    lastAttemptAt: v.number(),
  })
    .index("by_user_track", ["userId", "trackId"])
    .index("by_user_problem", ["userId", "problemId"]),
});
