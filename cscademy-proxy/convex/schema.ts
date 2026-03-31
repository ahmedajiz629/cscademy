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

  // Problems within a track (seeded, referenced by trackSlug)
  trackProblems: defineTable({
    trackSlug: v.string(),
    slug: v.string(),
    name: v.string(),
    description: v.string(),
    points: v.number(),
    order: v.number(),
    sampleInput: v.optional(v.string()),
    sampleOutput: v.optional(v.string()),
    starterCode: v.optional(v.string()), // JSON Record<langId, code>
    contestTaskId: v.optional(v.number()),
    referer: v.optional(v.string()),
    isActive: v.optional(v.boolean()), // undefined/true = active, false = disabled
  })
    .index("by_trackSlug", ["trackSlug"])
    .index("by_trackSlug_slug", ["trackSlug", "slug"]),

  // Programming languages available per track (seeded from CSAcademy)
  programmingLanguages: defineTable({
    trackSlug: v.string(),
    langId: v.string(),
    name: v.string(),
    codemirrorMode: v.string(),
    order: v.number(),
  }).index("by_trackSlug", ["trackSlug"]),

  // Admin overrides for track active state (default = code module's isActive)
  trackSettings: defineTable({
    trackSlug: v.string(),
    isActive: v.boolean(),
  }).index("by_trackSlug", ["trackSlug"]),

  // User scores per problem
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
