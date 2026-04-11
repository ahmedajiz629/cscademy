import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const mainProjectCustomTextFieldValidator = v.object({
  id: v.string(),
  label: v.string(),
  placeholder: v.optional(v.string()),
  helpText: v.optional(v.string()),
  required: v.optional(v.boolean()),
  multiline: v.optional(v.boolean()),
});

const mainProjectCustomTextFieldValueValidator = v.object({
  fieldId: v.string(),
  value: v.string(),
});

const mainProjectEvaluationCriterionValidator = v.object({
  id: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  coefficient: v.number(),
});

const mainProjectEvaluationScoreValidator = v.object({
  criterionId: v.string(),
  points: v.number(),
});

const mainProjectUploadFieldKeyValidator = v.union(
  v.literal("archive"),
  v.literal("presentation"),
  v.literal("report"),
  v.literal("demoVideo")
);

export default defineSchema({
  // Platform users (admin & student)
  users: defineTable({
    name: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    role: v.union(v.literal("admin"), v.literal("student")),
    isActive: v.boolean(),
    comment: v.optional(v.string()),
    offlineGatewayUrl: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  // Linked evaluation accounts (one per user, hidden from students)
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
    isActive: v.optional(v.boolean()), // undefined/true = active, false = disabled
    isOffline: v.optional(v.boolean()), // undefined/false = regular online task
    offlineTaskPreDescription: v.optional(v.string()),
    leaderboardVisible: v.optional(v.boolean()),
  })
    .index("by_trackSlug", ["trackSlug"])
    .index("by_trackSlug_slug", ["trackSlug", "slug"]),

  // Algorithmics-only problem settings
  algorithmicsProblemConfigs: defineTable({
    problemId: v.id("trackProblems"),
    sampleInput: v.optional(v.string()),
    sampleOutput: v.optional(v.string()),
    sampleTests: v.optional(v.array(v.object({ input: v.optional(v.string()), output: v.optional(v.string()) }))),
    starterCode: v.optional(v.string()), // JSON Record<langId, code>
    contestTaskId: v.optional(v.number()),
    referer: v.optional(v.string()),
  }).index("by_problemId", ["problemId"]),

  // Software engineering-only problem settings
  softwareEngineeringProblemConfigs: defineTable({
    problemId: v.id("trackProblems"),
    publicRepositoryUrl: v.optional(v.string()),
    evaluationImage: v.optional(v.string()),
    baseCommit: v.optional(v.string()),
    defaultSubmissionRef: v.optional(v.string()),
    extraDockerEnvVars: v.optional(v.string()),
  }).index("by_problemId", ["problemId"]),

  // Logic & reverse engineering-only problem settings
  logicReverseEngineeringProblemConfigs: defineTable({
    problemId: v.id("trackProblems"),
    judgeFilePath: v.optional(v.string()),
    evaluationImage: v.optional(v.string()),
    evaluationCommand: v.optional(v.string()),
    starterSubmission: v.optional(v.string()),
  }).index("by_problemId", ["problemId"]),

  // CTF-only problem settings
  ctfProblemConfigs: defineTable({
    problemId: v.id("trackProblems"),
    downloadableFilePath: v.optional(v.string()),
    externalLink: v.optional(v.string()),
    flagHash: v.optional(v.string()),
    encryptedFlag: v.optional(v.string()),
  }).index("by_problemId", ["problemId"]),

  // Main project-only problem settings
  mainProjectProblemConfigs: defineTable({
    problemId: v.id("trackProblems"),
    briefDownloadUrl: v.optional(v.string()),
    depotOpensAt: v.optional(v.number()),
    depotClosesAt: v.optional(v.number()),
    customTextFields: v.optional(v.array(mainProjectCustomTextFieldValidator)),
    evaluationCriteria: v.optional(v.array(mainProjectEvaluationCriterionValidator)),
  }).index("by_problemId", ["problemId"]),

  mainProjectUploadRegistrations: defineTable({
    userId: v.id("users"),
    problemId: v.id("trackProblems"),
    fieldKey: mainProjectUploadFieldKeyValidator,
    fileName: v.string(),
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    sha256: v.string(),
    createdAt: v.number(),
  })
    .index("by_user_problem", ["userId", "problemId"])
    .index("by_user_problem_field_hash", ["userId", "problemId", "fieldKey", "sha256"]),

  mainProjectSubmissions: defineTable({
    userId: v.id("users"),
    problemId: v.id("trackProblems"),
    archiveUrl: v.string(),
    archiveHash: v.string(),
    presentationUrl: v.string(),
    presentationHash: v.string(),
    reportUrl: v.string(),
    reportHash: v.string(),
    demoType: v.union(v.literal("youtube"), v.literal("upload")),
    demoUrl: v.string(),
    demoHash: v.optional(v.string()),
    customFieldValues: v.array(mainProjectCustomTextFieldValueValidator),
    evaluationScores: v.optional(v.array(mainProjectEvaluationScoreValidator)),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_problem", ["userId", "problemId"])
    .index("by_problem", ["problemId"]),

  // Per-student lifecycle for offline/LAN-gated problems
  offlineProblemSessions: defineTable({
    userId: v.id("users"),
    trackSlug: v.string(),
    problemSlug: v.string(),
    sessionId: v.string(),
    gatewayUrl: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("active"),
      v.literal("terminated")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    startedAt: v.optional(v.number()),
    lastHeartbeatAt: v.optional(v.number()),
    terminatedAt: v.optional(v.number()),
    terminatedReason: v.optional(v.string()),
    flaggedAt: v.optional(v.number()),
    flagReason: v.optional(v.string()),
    flagCount: v.optional(v.number()),
  })
    .index("by_user_problem", ["userId", "trackSlug", "problemSlug"])
    .index("by_user_track", ["userId", "trackSlug"])
    .index("by_sessionId", ["sessionId"]),

  // Programming languages available per track (seeded from the evaluation provider)
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
    leaderboardVisible: v.optional(v.boolean()),
    leaderboardCoefficient: v.optional(v.number()),
  }).index("by_trackSlug", ["trackSlug"]),

  platformSettings: defineTable({
    key: v.string(),
    globalLeaderboardVisible: v.optional(v.boolean()),
  }).index("by_key", ["key"]),

  notifications: defineTable({
    title: v.string(),
    message: v.string(),
    kind: v.union(
      v.literal("custom"),
      v.literal("track_opened"),
      v.literal("track_closed"),
      v.literal("problem_opened"),
      v.literal("problem_closed"),
      v.literal("depot_opened")
    ),
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
    trackSlug: v.optional(v.string()),
    problemSlug: v.optional(v.string()),
    linkUrl: v.optional(v.string()),
    linkLabel: v.optional(v.string()),
    createdAt: v.number(),
    createdByUserId: v.optional(v.id("users")),
  }).index("by_createdAt", ["createdAt"]),

  notificationDismissals: defineTable({
    notificationId: v.id("notifications"),
    userId: v.id("users"),
    dismissedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_notification", ["userId", "notificationId"]),

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
    .index("by_user_problem", ["userId", "trackSlug", "problemSlug"]),
});
