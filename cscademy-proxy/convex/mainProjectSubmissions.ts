import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  MAIN_PROJECT_TRACK_SLUG,
  fileMatchesMainProjectField,
  isSha256Hex,
  normalizeMainProjectEvaluationScoreEntries,
  sumMainProjectEvaluationScores,
  type MainProjectCustomTextField,
  type MainProjectCustomTextFieldValue,
  type MainProjectEvaluationCriterion,
  type MainProjectEvaluationScoreEntry,
} from "../lib/main-project";
import {
  requireAdminOrService,
  requireIdentity,
} from "./auth";
import { insertMainProjectDepotOpenedNotification } from "./notificationHelpers";

const mainProjectCustomTextFieldValueValidator = v.object({
  fieldId: v.string(),
  value: v.string(),
});

const uploadFieldKeyValidator = v.union(
  v.literal("archive"),
  v.literal("presentation"),
  v.literal("report"),
  v.literal("demoVideo")
);

async function requireViewerUserId(ctx: Parameters<typeof requireIdentity>[0]) {
  const identity = await requireIdentity(ctx);

  if (!identity.userId) {
    throw new Error("Unauthorized");
  }

  return identity.userId;
}

async function getMainProjectProblemBySlug(ctx: any, problemSlug: string) {
  const problem = await ctx.db
    .query("trackProblems")
    .withIndex("by_trackSlug_slug", (q: any) =>
      q.eq("trackSlug", MAIN_PROJECT_TRACK_SLUG).eq("slug", problemSlug)
    )
    .first();

  if (!problem || problem.isActive === false) {
    return null;
  }

  return problem;
}

async function getMainProjectProblemById(ctx: any, problemId: Id<"trackProblems">) {
  const problem = await ctx.db.get(problemId);

  if (!problem || problem.trackSlug !== MAIN_PROJECT_TRACK_SLUG) {
    return null;
  }

  return problem;
}

async function getMainProjectConfigByProblemId(ctx: any, problemId: Id<"trackProblems">) {
  return ctx.db
    .query("mainProjectProblemConfigs")
    .withIndex("by_problemId", (q: any) => q.eq("problemId", problemId))
    .first();
}

function isDepotCurrentlyOpen(
  config:
    | {
        depotOpensAt?: number;
        depotClosesAt?: number;
      }
    | null
    | undefined,
  now = Date.now()
) {
  return Boolean(
    config?.depotOpensAt &&
      config?.depotClosesAt &&
      now >= config.depotOpensAt &&
      now <= config.depotClosesAt
  );
}

function normalizeSubmittedCustomFieldValues(
  values: MainProjectCustomTextFieldValue[]
) {
  return values.map((entry) => ({
    fieldId: entry.fieldId.trim(),
    value: entry.value.trim(),
  }));
}

function validateSubmittedCustomFieldValues(
  configuredFields: MainProjectCustomTextField[] | undefined,
  submittedValues: MainProjectCustomTextFieldValue[]
) {
  const configById = new Map(
    (configuredFields ?? []).map((field) => [field.id, field])
  );
  const normalizedValues = normalizeSubmittedCustomFieldValues(submittedValues).filter(
    (entry) => entry.fieldId && entry.value
  );
  const valueById = new Map(normalizedValues.map((entry) => [entry.fieldId, entry.value]));

  for (const field of configuredFields ?? []) {
    if (field.required && !valueById.get(field.id)?.trim()) {
      throw new Error(`The field "${field.label}" is required.`);
    }
  }

  for (const entry of normalizedValues) {
    if (!configById.has(entry.fieldId)) {
      throw new Error("Submission includes an unknown custom field.");
    }
  }

  return (configuredFields ?? [])
    .map((field) => ({
      fieldId: field.id,
      value: valueById.get(field.id)?.trim() ?? "",
    }))
    .filter((entry) => entry.value);
}

function areMainProjectEvaluationScoresEqual(
  left?: MainProjectEvaluationScoreEntry[] | null,
  right?: MainProjectEvaluationScoreEntry[] | null
) {
  const normalizedLeft = left ?? [];
  const normalizedRight = right ?? [];

  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }

  return normalizedLeft.every(
    (entry, index) =>
      entry.criterionId === normalizedRight[index]?.criterionId &&
      entry.points === normalizedRight[index]?.points
  );
}

async function upsertExactMainProjectScore(
  ctx: any,
  problem: { trackSlug: string; slug: string; points: number },
  userId: Id<"users">,
  score: number,
  { createIfMissing = true }: { createIfMissing?: boolean } = {}
) {
  const normalizedScore = Math.min(problem.points, Math.max(0, score));
  const existing = await ctx.db
    .query("scores")
    .withIndex("by_user_problem", (q: any) =>
      q
        .eq("userId", userId)
        .eq("trackSlug", problem.trackSlug)
        .eq("problemSlug", problem.slug)
    )
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      score: normalizedScore,
      lastAttemptAt: Date.now(),
    });
    return existing._id;
  }

  if (!createIfMissing) {
    return null;
  }

  return ctx.db.insert("scores", {
    userId,
    trackSlug: problem.trackSlug,
    problemSlug: problem.slug,
    score: normalizedScore,
    attempts: 0,
    lastAttemptAt: Date.now(),
  });
}

async function requireRegisteredUploadHash(
  ctx: any,
  {
    userId,
    problemId,
    fieldKey,
    sha256,
    closesAt,
  }: {
    userId: Id<"users">;
    problemId: Id<"trackProblems">;
    fieldKey: "archive" | "presentation" | "report" | "demoVideo";
    sha256: string;
    closesAt: number;
  }
) {
  const registration = await ctx.db
    .query("mainProjectUploadRegistrations")
    .withIndex("by_user_problem_field_hash", (q: any) =>
      q
        .eq("userId", userId)
        .eq("problemId", problemId)
        .eq("fieldKey", fieldKey)
        .eq("sha256", sha256.toLowerCase())
    )
    .first();

  if (!registration) {
    throw new Error(`The ${fieldKey} file hash was not registered before submission.`);
  }

  if (registration.createdAt > closesAt) {
    throw new Error(
      `The ${fieldKey} file hash was registered after the depot closed.`
    );
  }

  return registration;
}

export const getMineByProblem = query({
  args: { problemSlug: v.string() },
  handler: async (ctx, { problemSlug }) => {
    const userId = await requireViewerUserId(ctx);
    const problem = await getMainProjectProblemBySlug(ctx, problemSlug);

    if (!problem) {
      return null;
    }

    return ctx.db
      .query("mainProjectSubmissions")
      .withIndex("by_user_problem", (q) =>
        q.eq("userId", userId).eq("problemId", problem._id)
      )
      .first();
  },
});

export const listByProblemAdmin = query({
  args: { problemId: v.id("trackProblems") },
  handler: async (ctx, { problemId }) => {
    await requireAdminOrService(ctx);

    const problem = await getMainProjectProblemById(ctx, problemId);
    if (!problem) {
      return [];
    }

    const [rawSubmissions, users] = await Promise.all([
      ctx.db
        .query("mainProjectSubmissions")
        .withIndex("by_problem", (q) => q.eq("problemId", problemId))
        .collect(),
      ctx.db.query("users").collect(),
    ]);
    const submissions = rawSubmissions as Array<any>;

    const userMap = new Map(users.map((user) => [user._id, user]));

    return submissions
      .map((submission) => ({
        ...submission,
        evaluationScores: submission.evaluationScores ?? [],
        userEmail: userMap.get(submission.userId)?.email ?? "",
        userName: userMap.get(submission.userId)?.name ?? "Unknown user",
      }))
      .sort((left, right) => right.updatedAt - left.updatedAt);
  },
});

export const getUploadAuthorization = query({
  args: {
    problemSlug: v.string(),
    fieldKey: uploadFieldKeyValidator,
    sha256: v.string(),
  },
  handler: async (ctx, { problemSlug, fieldKey, sha256 }) => {
    const userId = await requireViewerUserId(ctx);
    const problem = await getMainProjectProblemBySlug(ctx, problemSlug);

    if (!problem) {
      return { allowed: false };
    }

    const [config, registration] = await Promise.all([
      getMainProjectConfigByProblemId(ctx, problem._id),
      ctx.db
        .query("mainProjectUploadRegistrations")
        .withIndex("by_user_problem_field_hash", (q: any) =>
          q
            .eq("userId", userId)
            .eq("problemId", problem._id)
            .eq("fieldKey", fieldKey)
            .eq("sha256", sha256.trim().toLowerCase())
        )
        .first(),
    ]);

    const closesAt = config?.depotClosesAt;

    return {
      allowed: Boolean(registration && closesAt && registration.createdAt <= closesAt),
      closesAt: closesAt ?? null,
      registeredAt: registration?.createdAt ?? null,
    };
  },
});

export const registerUpload = mutation({
  args: {
    problemSlug: v.string(),
    fieldKey: uploadFieldKeyValidator,
    fileName: v.string(),
    mimeType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    sha256: v.string(),
  },
  handler: async (ctx, { problemSlug, fieldKey, fileName, mimeType, fileSize, sha256 }) => {
    const userId = await requireViewerUserId(ctx);
    const problem = await getMainProjectProblemBySlug(ctx, problemSlug);

    if (!problem) {
      throw new Error("Problem not found.");
    }

    const config = await getMainProjectConfigByProblemId(ctx, problem._id);

    if (!isDepotCurrentlyOpen(config)) {
      throw new Error("The depot is not currently open for uploads.");
    }

    if (!isSha256Hex(sha256)) {
      throw new Error("Upload hash must be a SHA-256 hex string.");
    }

    const normalizedFileName = fileName.trim();
    const normalizedMimeType = mimeType?.trim() || undefined;

    if (!normalizedFileName) {
      throw new Error("A file name is required.");
    }

    if (!fileMatchesMainProjectField(fieldKey, normalizedFileName, normalizedMimeType)) {
      throw new Error(`The selected file is not valid for ${fieldKey}.`);
    }

    const normalizedHash = sha256.trim().toLowerCase();
    const existing = await ctx.db
      .query("mainProjectUploadRegistrations")
      .withIndex("by_user_problem_field_hash", (q: any) =>
        q
          .eq("userId", userId)
          .eq("problemId", problem._id)
          .eq("fieldKey", fieldKey)
          .eq("sha256", normalizedHash)
      )
      .first();

    if (existing) {
      return existing._id;
    }

    return ctx.db.insert("mainProjectUploadRegistrations", {
      userId,
      problemId: problem._id,
      fieldKey,
      fileName: normalizedFileName,
      mimeType: normalizedMimeType,
      fileSize,
      sha256: normalizedHash,
      createdAt: Date.now(),
    });
  },
});

export const saveVerifiedSubmission = mutation({
  args: {
    userId: v.id("users"),
    problemSlug: v.string(),
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
  },
  handler: async (ctx, args) => {
    await requireAdminOrService(ctx);

    const problem = await getMainProjectProblemBySlug(ctx, args.problemSlug);
    if (!problem) {
      throw new Error("Problem not found.");
    }

    const config = await getMainProjectConfigByProblemId(ctx, problem._id);

    if (!config?.depotClosesAt) {
      throw new Error("The depot has not been opened yet.");
    }

    const customFieldValues = validateSubmittedCustomFieldValues(
      config.customTextFields,
      args.customFieldValues as MainProjectCustomTextFieldValue[]
    );

    await requireRegisteredUploadHash(ctx, {
      userId: args.userId,
      problemId: problem._id,
      fieldKey: "archive",
      sha256: args.archiveHash.trim().toLowerCase(),
      closesAt: config.depotClosesAt,
    });
    await requireRegisteredUploadHash(ctx, {
      userId: args.userId,
      problemId: problem._id,
      fieldKey: "presentation",
      sha256: args.presentationHash.trim().toLowerCase(),
      closesAt: config.depotClosesAt,
    });
    await requireRegisteredUploadHash(ctx, {
      userId: args.userId,
      problemId: problem._id,
      fieldKey: "report",
      sha256: args.reportHash.trim().toLowerCase(),
      closesAt: config.depotClosesAt,
    });

    const normalizedDemoHash = args.demoHash?.trim().toLowerCase();
    if (args.demoType === "upload") {
      if (!normalizedDemoHash) {
        throw new Error("A demo video hash is required for uploaded demos.");
      }

      await requireRegisteredUploadHash(ctx, {
        userId: args.userId,
        problemId: problem._id,
        fieldKey: "demoVideo",
        sha256: normalizedDemoHash,
        closesAt: config.depotClosesAt,
      });
    }

    const existing = await ctx.db
      .query("mainProjectSubmissions")
      .withIndex("by_user_problem", (q) =>
        q.eq("userId", args.userId).eq("problemId", problem._id)
      )
      .first();

    const payload = {
      archiveUrl: args.archiveUrl.trim(),
      archiveHash: args.archiveHash.trim().toLowerCase(),
      presentationUrl: args.presentationUrl.trim(),
      presentationHash: args.presentationHash.trim().toLowerCase(),
      reportUrl: args.reportUrl.trim(),
      reportHash: args.reportHash.trim().toLowerCase(),
      demoType: args.demoType,
      demoUrl: args.demoUrl.trim(),
      demoHash: args.demoType === "upload" ? normalizedDemoHash : undefined,
      customFieldValues,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...payload,
        evaluationScores: [],
      } as any);
      await upsertExactMainProjectScore(ctx, problem, args.userId, 0, {
        createIfMissing: false,
      });
      return existing._id;
    }

    return ctx.db.insert("mainProjectSubmissions", {
      userId: args.userId,
      problemId: problem._id,
      createdAt: Date.now(),
      ...payload,
    });
  },
});

export const setEvaluationScore = mutation({
  args: {
    submissionId: v.id("mainProjectSubmissions"),
    criterionId: v.string(),
    points: v.optional(v.number()),
  },
  handler: async (ctx, { submissionId, criterionId, points }) => {
    await requireAdminOrService(ctx);

    const submission = (await ctx.db.get(submissionId)) as any;
    if (!submission) {
      throw new Error("Main project submission not found.");
    }

    const problem = await getMainProjectProblemById(ctx, submission.problemId);
    if (!problem) {
      throw new Error("Main project problem not found.");
    }

    const config = await getMainProjectConfigByProblemId(ctx, problem._id);
    const criteria = (config?.evaluationCriteria ?? []) as MainProjectEvaluationCriterion[];
    const normalizedCriterionId = criterionId.trim();

    if (!normalizedCriterionId) {
      throw new Error("Evaluation criterion is required.");
    }

    const criterion = criteria.find((entry) => entry.id === normalizedCriterionId);
    if (!criterion) {
      throw new Error("Evaluation criterion not found.");
    }

    if (
      points !== undefined &&
      (!Number.isFinite(points) || points < 0 || points > criterion.coefficient)
    ) {
      throw new Error(
        `Score must be between 0 and ${criterion.coefficient} for this criterion.`
      );
    }

    const currentScores = Array.isArray(submission.evaluationScores)
      ? (submission.evaluationScores as MainProjectEvaluationScoreEntry[])
      : [];
    const nextScoreEntries = new Map(
      currentScores.map((entry) => [entry.criterionId, entry.points])
    );

    if (points === undefined) {
      nextScoreEntries.delete(normalizedCriterionId);
    } else {
      nextScoreEntries.set(normalizedCriterionId, Number(points));
    }

    const nextScores = normalizeMainProjectEvaluationScoreEntries(
      criteria,
      Array.from(nextScoreEntries, ([nextCriterionId, nextPoints]) => ({
        criterionId: nextCriterionId,
        points: nextPoints,
      }))
    );

    if (!areMainProjectEvaluationScoresEqual(currentScores, nextScores)) {
      await ctx.db.patch(submissionId, { evaluationScores: nextScores } as any);
    }

    const totalScore = sumMainProjectEvaluationScores(nextScores);
    await upsertExactMainProjectScore(ctx, problem, submission.userId, totalScore, {
      createIfMissing: nextScores.length > 0,
    });

    return {
      totalScore: Math.min(problem.points, Math.max(0, totalScore)),
      evaluationScores: nextScores,
    };
  },
});

export const openDepot = mutation({
  args: { problemId: v.id("trackProblems"), closesAt: v.number() },
  handler: async (ctx, { problemId, closesAt }) => {
    await requireAdminOrService(ctx);

    const problem = await getMainProjectProblemById(ctx, problemId);
    if (!problem) {
      throw new Error("Main project problem not found.");
    }

    const now = Date.now();
    if (!Number.isFinite(closesAt) || closesAt <= now) {
      throw new Error("Depot closing time must be in the future.");
    }

    const existingConfig = await getMainProjectConfigByProblemId(ctx, problemId);
    const wasOpen = isDepotCurrentlyOpen(existingConfig, now);

    if (existingConfig) {
      await ctx.db.patch(existingConfig._id, {
        depotOpensAt: now,
        depotClosesAt: closesAt,
      });
    } else {
      await ctx.db.insert("mainProjectProblemConfigs", {
        problemId,
        depotOpensAt: now,
        depotClosesAt: closesAt,
      });
    }

    if (!wasOpen) {
      await insertMainProjectDepotOpenedNotification(ctx, problem, closesAt);
    }

    return problemId;
  },
});

export const closeDepotNow = mutation({
  args: { problemId: v.id("trackProblems") },
  handler: async (ctx, { problemId }) => {
    await requireAdminOrService(ctx);

    const problem = await getMainProjectProblemById(ctx, problemId);
    if (!problem) {
      throw new Error("Main project problem not found.");
    }

    const existingConfig = await getMainProjectConfigByProblemId(ctx, problemId);
    if (!existingConfig) {
      throw new Error("This main project does not have a depot configuration yet.");
    }

    await ctx.db.patch(existingConfig._id, {
      depotClosesAt: Date.now(),
    });

    return existingConfig._id;
  },
});