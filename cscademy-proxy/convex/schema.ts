import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  problems: defineTable({
    slug: v.string(),
    name: v.string(),
    description: v.string(),
    contestTaskId: v.number(),
    referer: v.string(),
    starterCode: v.string(),
    sampleInput: v.string(),
    sampleOutput: v.string(),
    programmingLanguageId: v.optional(v.string()),
  }).index("by_slug", ["slug"]),

  submissions: defineTable({
    problemSlug: v.string(),
    sourceCode: v.string(),
    type: v.string(), // "run" or "submit"
    input: v.optional(v.string()),
    status: v.string(), // "pending", "running", "done", "error"
    result: v.optional(v.any()),
    score: v.optional(v.number()),
    externalId: v.optional(v.string()),
  }).index("by_problem", ["problemSlug"]),
});
