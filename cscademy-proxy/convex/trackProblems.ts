import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireAdminOrService, requireService } from "./auth";
import { insertProblemAvailabilityNotification } from "./notificationHelpers";
import {
  normalizeMainProjectEvaluationScoreEntries,
  sumMainProjectEvaluationScores,
} from "../lib/main-project";

const mainProjectCustomTextFieldValidator = v.object({
  id: v.string(),
  label: v.string(),
  placeholder: v.optional(v.string()),
  helpText: v.optional(v.string()),
  required: v.optional(v.boolean()),
  multiline: v.optional(v.boolean()),
});

const mainProjectEvaluationCriterionValidator = v.object({
  id: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  coefficient: v.number(),
});

type BaseProblem = Doc<"trackProblems">;

function cleanFields(fields: Record<string, unknown>) {
  const clean: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) {
      clean[key] = value;
    }
  }

  return clean;
}

function getTrimmedString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function assertLogicReverseEngineeringConfig(
  fields: {
    judgeFilePath?: string;
    evaluationImage?: string;
    evaluationCommand?: string;
  },
  existing?: {
    judgeFilePath?: string;
    evaluationImage?: string;
    evaluationCommand?: string;
  } | null
) {
  const judgeFilePath =
    getTrimmedString(fields.judgeFilePath) ??
    getTrimmedString(existing?.judgeFilePath);
  const evaluationImage =
    getTrimmedString(fields.evaluationImage) ??
    getTrimmedString(existing?.evaluationImage);
  const evaluationCommand =
    getTrimmedString(fields.evaluationCommand) ??
    getTrimmedString(existing?.evaluationCommand);

  if (!judgeFilePath || !evaluationImage || !evaluationCommand) {
    throw new Error(
      "Logic & reverse engineering problems require judgeFilePath, evaluationImage, and evaluationCommand."
    );
  }
}

function assertSoftwareEngineeringExtraDockerEnvVars(value?: string | null) {
  if (!value?.trim()) {
    return;
  }

  const invalidLines: string[] = [];

  for (const rawLine of value.split(/\r?\n/)) {
    const trimmedLine = rawLine.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");
    if (separatorIndex <= 0) {
      invalidLines.push(trimmedLine);
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      invalidLines.push(trimmedLine);
    }
  }

  if (invalidLines.length > 0) {
    throw new Error(
      "Extra Docker env vars must use KEY=value format, one per line."
    );
  }
}

function assertMainProjectCustomTextFields(
  fields?: Array<{
    id: string;
    label: string;
    placeholder?: string;
    helpText?: string;
    required?: boolean;
    multiline?: boolean;
  }> | null
) {
  if (!fields) {
    return;
  }

  const seenIds = new Set<string>();

  for (const field of fields) {
    const id = field.id.trim();
    const label = field.label.trim();

    if (!id || !/^[a-z0-9-]+$/i.test(id)) {
      throw new Error("Main project custom field IDs must be URL-safe strings.");
    }

    if (!label) {
      throw new Error("Main project custom fields require a label.");
    }

    if (seenIds.has(id)) {
      throw new Error("Main project custom field IDs must be unique.");
    }

    seenIds.add(id);
  }
}

function normalizeMainProjectCustomTextFields(
  fields?: Array<{
    id: string;
    label: string;
    placeholder?: string;
    helpText?: string;
    required?: boolean;
    multiline?: boolean;
  }> | null
) {
  if (!fields) {
    return undefined;
  }

  return fields.map((field) => ({
    id: field.id.trim(),
    label: field.label.trim(),
    placeholder: getTrimmedString(field.placeholder) ?? undefined,
    helpText: getTrimmedString(field.helpText) ?? undefined,
    required: field.required === true,
    multiline: field.multiline === true,
  }));
}

function assertMainProjectEvaluationCriteria(
  criteria?: Array<{
    id: string;
    name: string;
    description?: string;
    coefficient: number;
  }> | null
) {
  if (!criteria) {
    return;
  }

  const seenIds = new Set<string>();

  for (const criterion of criteria) {
    const id = criterion.id.trim();
    const name = criterion.name.trim();
    const coefficient = Number(criterion.coefficient);

    if (!id || !/^[a-z0-9-]+$/i.test(id)) {
      throw new Error("Main project evaluation criterion IDs must be URL-safe strings.");
    }

    if (!name) {
      throw new Error("Main project evaluation criteria require a name.");
    }

    if (!Number.isFinite(coefficient) || coefficient < 0) {
      throw new Error(
        "Main project evaluation criteria require a valid non-negative coefficient."
      );
    }

    if (seenIds.has(id)) {
      throw new Error("Main project evaluation criterion IDs must be unique.");
    }

    seenIds.add(id);
  }
}

function normalizeMainProjectEvaluationCriteria(
  criteria?: Array<{
    id: string;
    name: string;
    description?: string;
    coefficient: number;
  }> | null
) {
  if (!criteria) {
    return undefined;
  }

  return criteria.map((criterion) => ({
    id: criterion.id.trim(),
    name: criterion.name.trim(),
    description: getTrimmedString(criterion.description) ?? undefined,
    coefficient: Number(criterion.coefficient),
  }));
}

function areMainProjectEvaluationScoresEqual(
  left?: Array<{ criterionId: string; points: number }> | null,
  right?: Array<{ criterionId: string; points: number }> | null
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

async function upsertExactProblemScore(
  ctx: any,
  problem: BaseProblem,
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

async function syncMainProjectEvaluationScoresForProblem(
  ctx: any,
  problem: BaseProblem,
  evaluationCriteria?: Array<{
    id: string;
    name: string;
    description?: string;
    coefficient: number;
  }> | null
) {
  const submissions = (await ctx.db
    .query("mainProjectSubmissions")
    .withIndex("by_problem", (q: any) => q.eq("problemId", problem._id))
    .collect()) as Array<any>;

  for (const submission of submissions) {
    const currentScores = Array.isArray(submission.evaluationScores)
      ? submission.evaluationScores
      : [];
    const nextScores = normalizeMainProjectEvaluationScoreEntries(
      evaluationCriteria,
      currentScores
    );

    if (!areMainProjectEvaluationScoresEqual(currentScores, nextScores)) {
      await ctx.db.patch(submission._id, { evaluationScores: nextScores } as any);
    }

    if (currentScores.length > 0 || nextScores.length > 0) {
      await upsertExactProblemScore(
        ctx,
        problem,
        submission.userId,
        sumMainProjectEvaluationScores(nextScores),
        { createIfMissing: nextScores.length > 0 }
      );
    }
  }
}

async function getAlgorithmicsConfigByProblemId(ctx: any, problemId: Id<"trackProblems">) {
  const configs = await ctx.db
    .query("algorithmicsProblemConfigs")
    .withIndex("by_problemId", (queryRef: any) => queryRef.eq("problemId", problemId))
    .collect();

  return configs[0] || null;
}

async function getSoftwareEngineeringConfigByProblemId(
  ctx: any,
  problemId: Id<"trackProblems">
) {
  const configs = await ctx.db
    .query("softwareEngineeringProblemConfigs")
    .withIndex("by_problemId", (queryRef: any) => queryRef.eq("problemId", problemId))
    .collect();

  return configs[0] || null;
}

async function getLogicReverseEngineeringConfigByProblemId(
  ctx: any,
  problemId: Id<"trackProblems">
) {
  const configs = await ctx.db
    .query("logicReverseEngineeringProblemConfigs")
    .withIndex("by_problemId", (queryRef: any) => queryRef.eq("problemId", problemId))
    .collect();

  return configs[0] || null;
}

async function getCtfConfigByProblemId(ctx: any, problemId: Id<"trackProblems">) {
  const configs = await ctx.db
    .query("ctfProblemConfigs")
    .withIndex("by_problemId", (queryRef: any) => queryRef.eq("problemId", problemId))
    .collect();

  return configs[0] || null;
}

async function getMainProjectConfigByProblemId(
  ctx: any,
  problemId: Id<"trackProblems">
) {
  const configs = await ctx.db
    .query("mainProjectProblemConfigs")
    .withIndex("by_problemId", (queryRef: any) => queryRef.eq("problemId", problemId))
    .collect();

  return configs[0] || null;
}

async function upsertAlgorithmicsConfig(
  ctx: any,
  problemId: Id<"trackProblems">,
  fields: {
    sampleInput?: string;
    sampleOutput?: string;
    starterCode?: string;
    contestTaskId?: number;
    referer?: string;
  }
) {
  const existingConfig = await getAlgorithmicsConfigByProblemId(ctx, problemId);
  const cleanConfig = cleanFields(fields);

  if (existingConfig) {
    if (Object.keys(cleanConfig).length > 0) {
      await ctx.db.patch(existingConfig._id, cleanConfig);
    }
    return;
  }

  if (Object.keys(cleanConfig).length === 0) {
    return;
  }

  await ctx.db.insert("algorithmicsProblemConfigs", {
    problemId,
    ...cleanConfig,
  });
}

async function upsertSoftwareEngineeringConfig(
  ctx: any,
  problemId: Id<"trackProblems">,
  fields: {
    publicRepositoryUrl?: string;
    evaluationImage?: string;
    baseCommit?: string;
    defaultSubmissionRef?: string;
    extraDockerEnvVars?: string;
  }
) {
  const existingConfig = await getSoftwareEngineeringConfigByProblemId(ctx, problemId);
  const cleanConfig = cleanFields(fields);

  if (existingConfig) {
    if (Object.keys(cleanConfig).length > 0) {
      await ctx.db.patch(existingConfig._id, cleanConfig);
    }
    return;
  }

  if (Object.keys(cleanConfig).length === 0) {
    return;
  }

  await ctx.db.insert("softwareEngineeringProblemConfigs", {
    problemId,
    ...cleanConfig,
  });
}

async function upsertLogicReverseEngineeringConfig(
  ctx: any,
  problemId: Id<"trackProblems">,
  fields: {
    judgeFilePath?: string;
    evaluationImage?: string;
    evaluationCommand?: string;
    starterSubmission?: string;
  }
) {
  const existingConfig = await getLogicReverseEngineeringConfigByProblemId(
    ctx,
    problemId
  );
  const cleanConfig = cleanFields(fields);

  if (existingConfig) {
    if (Object.keys(cleanConfig).length > 0) {
      await ctx.db.patch(existingConfig._id, cleanConfig);
    }
    return;
  }

  if (Object.keys(cleanConfig).length === 0) {
    return;
  }

  await ctx.db.insert("logicReverseEngineeringProblemConfigs", {
    problemId,
    ...cleanConfig,
  });
}

async function upsertCtfConfig(
  ctx: any,
  problemId: Id<"trackProblems">,
  fields: {
    downloadableFilePath?: string;
    externalLink?: string;
    flagHash?: string;
  }
) {
  const existingConfig = await getCtfConfigByProblemId(ctx, problemId);
  const normalizedFlagHash = fields.flagHash?.trim();
  const cleanConfig = cleanFields({
    downloadableFilePath: fields.downloadableFilePath,
    externalLink: fields.externalLink,
    flagHash: normalizedFlagHash,
  });

  if (existingConfig) {
    if (Object.keys(cleanConfig).length > 0) {
      await ctx.db.patch(existingConfig._id, cleanConfig);
    }
    return;
  }

  if (!normalizedFlagHash) {
    throw new Error("CTF flag hash is required.");
  }

  await ctx.db.insert("ctfProblemConfigs", {
    problemId,
    ...cleanConfig,
    flagHash: normalizedFlagHash,
  });
}

async function upsertMainProjectConfig(
  ctx: any,
  problemId: Id<"trackProblems">,
  fields: {
    briefDownloadUrl?: string;
    depotClosesAt?: number;
    customTextFields?: Array<{
      id: string;
      label: string;
      placeholder?: string;
      helpText?: string;
      required?: boolean;
      multiline?: boolean;
    }>;
    evaluationCriteria?: Array<{
      id: string;
      name: string;
      description?: string;
      coefficient: number;
    }>;
  }
) {
  const existingConfig = await getMainProjectConfigByProblemId(ctx, problemId);
  const cleanConfig = cleanFields({
    briefDownloadUrl: fields.briefDownloadUrl,
    depotClosesAt: fields.depotClosesAt,
    customTextFields: normalizeMainProjectCustomTextFields(fields.customTextFields),
    evaluationCriteria: normalizeMainProjectEvaluationCriteria(fields.evaluationCriteria),
  });

  if (existingConfig) {
    if (Object.keys(cleanConfig).length > 0) {
      await ctx.db.patch(existingConfig._id, cleanConfig);
    }
    return;
  }

  if (Object.keys(cleanConfig).length === 0) {
    return;
  }

  await ctx.db.insert("mainProjectProblemConfigs", {
    problemId,
    ...cleanConfig,
  });
}

async function deleteTrackSpecificConfig(ctx: any, problem: BaseProblem) {
  if (problem.trackSlug === "algorithmics") {
    const config = await getAlgorithmicsConfigByProblemId(ctx, problem._id);
    if (config) {
      await ctx.db.delete(config._id);
    }
    return;
  }

  if (problem.trackSlug === "software-engineering") {
    const config = await getSoftwareEngineeringConfigByProblemId(ctx, problem._id);
    if (config) {
      await ctx.db.delete(config._id);
    }
    return;
  }

  if (problem.trackSlug === "logic-reverse-engineering") {
    const config = await getLogicReverseEngineeringConfigByProblemId(ctx, problem._id);
    if (config) {
      await ctx.db.delete(config._id);
    }
    return;
  }

  if (problem.trackSlug === "ctf") {
    const config = await getCtfConfigByProblemId(ctx, problem._id);
    if (config) {
      await ctx.db.delete(config._id);
    }
    return;
  }

  if (problem.trackSlug === "main-project") {
    const config = await getMainProjectConfigByProblemId(ctx, problem._id);
    if (config) {
      await ctx.db.delete(config._id);
    }
  }
}

async function mergeProblemWithConfig(
  ctx: any,
  problem: BaseProblem,
  { includeSecrets = false }: { includeSecrets?: boolean } = {}
) {
  const sharedShape = {
    ...problem,
    sampleInput: undefined as string | undefined,
    sampleOutput: undefined as string | undefined,
    starterCode: undefined as string | undefined,
    contestTaskId: undefined as number | undefined,
    referer: undefined as string | undefined,
    publicRepositoryUrl: undefined as string | undefined,
    evaluationImage: undefined as string | undefined,
    baseCommit: undefined as string | undefined,
    defaultSubmissionRef: undefined as string | undefined,
    extraDockerEnvVars: undefined as string | undefined,
    judgeFilePath: undefined as string | undefined,
    evaluationCommand: undefined as string | undefined,
    starterSubmission: undefined as string | undefined,
    downloadableFilePath: undefined as string | undefined,
    externalLink: undefined as string | undefined,
    briefDownloadUrl: undefined as string | undefined,
    customTextFields: undefined as
      | Array<{
          id: string;
          label: string;
          placeholder?: string;
          helpText?: string;
          required?: boolean;
          multiline?: boolean;
        }>
      | undefined,
    evaluationCriteria: undefined as
      | Array<{
          id: string;
          name: string;
          description?: string;
          coefficient: number;
        }>
      | undefined,
    depotOpensAt: undefined as number | undefined,
    depotClosesAt: undefined as number | undefined,
    isOffline: problem.isOffline ?? false,
    offlineTaskPreDescription: problem.offlineTaskPreDescription,
    leaderboardVisible: problem.leaderboardVisible ?? false,
  };

  if (problem.trackSlug === "algorithmics") {
    const config = await getAlgorithmicsConfigByProblemId(ctx, problem._id);

    return {
      ...sharedShape,
      sampleInput: config?.sampleInput,
      sampleOutput: config?.sampleOutput,
      starterCode: config?.starterCode,
      contestTaskId: config?.contestTaskId,
      referer: config?.referer,
    };
  }

  if (problem.trackSlug === "software-engineering") {
    const config = await getSoftwareEngineeringConfigByProblemId(ctx, problem._id);

    return {
      ...sharedShape,
      publicRepositoryUrl: config?.publicRepositoryUrl,
      evaluationImage: config?.evaluationImage,
      baseCommit: config?.baseCommit,
      defaultSubmissionRef: config?.defaultSubmissionRef,
      extraDockerEnvVars: config?.extraDockerEnvVars,
    };
  }

  if (problem.trackSlug === "logic-reverse-engineering") {
    const config = await getLogicReverseEngineeringConfigByProblemId(
      ctx,
      problem._id
    );

    return {
      ...sharedShape,
      judgeFilePath: config?.judgeFilePath,
      evaluationImage: config?.evaluationImage,
      evaluationCommand: config?.evaluationCommand,
      starterSubmission: config?.starterSubmission,
    };
  }

  if (problem.trackSlug === "ctf") {
    const config = await getCtfConfigByProblemId(ctx, problem._id);

    return {
      ...sharedShape,
      downloadableFilePath: config?.downloadableFilePath,
      externalLink: config?.externalLink,
    };
  }

  if (problem.trackSlug === "main-project") {
    const config = await getMainProjectConfigByProblemId(ctx, problem._id);

    return {
      ...sharedShape,
      briefDownloadUrl: config?.briefDownloadUrl,
      customTextFields: config?.customTextFields,
      evaluationCriteria: config?.evaluationCriteria,
      depotOpensAt: config?.depotOpensAt,
      depotClosesAt: config?.depotClosesAt,
    };
  }

  return sharedShape;
}

export const listByTrack = query({
  args: { trackSlug: v.string() },
  handler: async (ctx, { trackSlug }) => {
    const problems = await ctx.db
      .query("trackProblems")
      .withIndex("by_trackSlug", (q) => q.eq("trackSlug", trackSlug))
      .collect();

    const visibleProblems = problems.filter((problem) => problem.isActive !== false);
    const mergedProblems = await Promise.all(
      visibleProblems.map((problem) => mergeProblemWithConfig(ctx, problem))
    );

    return mergedProblems.sort((left, right) => left.order - right.order);
  },
});

// Admin variant — returns all problems including disabled ones
export const listByTrackAdmin = query({
  args: { trackSlug: v.string() },
  handler: async (ctx, { trackSlug }) => {
    await requireAdminOrService(ctx);

    const problems = await ctx.db
      .query("trackProblems")
      .withIndex("by_trackSlug", (q) => q.eq("trackSlug", trackSlug))
      .collect();

    const mergedProblems = await Promise.all(
      problems.map((problem) =>
        mergeProblemWithConfig(ctx, problem, { includeSecrets: true })
      )
    );

    return mergedProblems.sort((left, right) => left.order - right.order);
  },
});

export const listAllAdmin = query({
  handler: async (ctx) => {
    await requireAdminOrService(ctx);

    const problems = await ctx.db.query("trackProblems").collect();

    const mergedProblems = await Promise.all(
      problems.map((problem) =>
        mergeProblemWithConfig(ctx, problem, { includeSecrets: true })
      )
    );

    return mergedProblems.sort((left, right) => {
      if (left.trackSlug !== right.trackSlug) {
        return left.trackSlug.localeCompare(right.trackSlug);
      }

      if (left.order !== right.order) {
        return left.order - right.order;
      }

      return left.name.localeCompare(right.name);
    });
  },
});

export const getBySlug = query({
  args: { trackSlug: v.string(), slug: v.string() },
  handler: async (ctx, { trackSlug, slug }) => {
    const results = await ctx.db
      .query("trackProblems")
      .withIndex("by_trackSlug_slug", (q) =>
        q.eq("trackSlug", trackSlug).eq("slug", slug)
      )
      .collect();

    const problem = results[0] || null;
    // Return null for disabled problems (students see "not found")
    if (problem?.isActive === false) return null;

    return problem ? mergeProblemWithConfig(ctx, problem) : null;
  },
});

export const getCtfValidationData = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    await requireService(ctx);

    const results = await ctx.db
      .query("trackProblems")
      .withIndex("by_trackSlug_slug", (q) => q.eq("trackSlug", "ctf").eq("slug", slug))
      .collect();

    const problem = results[0] || null;
    if (problem?.isActive === false || !problem) return null;

    const config = await getCtfConfigByProblemId(ctx, problem._id);

    return {
      points: problem.points,
      flagHash: config?.flagHash,
      hasLegacyEncryptedFlag: Boolean(config?.encryptedFlag?.trim()),
    };
  },
});

export const countByTrack = query({
  args: { trackSlug: v.string() },
  handler: async (ctx, { trackSlug }) => {
    const problems = await ctx.db
      .query("trackProblems")
      .withIndex("by_trackSlug", (q) => q.eq("trackSlug", trackSlug))
      .collect();
    return problems.filter((p) => p.isActive !== false).length;
  },
});

export const create = mutation({
  args: {
    trackSlug: v.string(),
    slug: v.string(),
    name: v.string(),
    description: v.string(),
    points: v.number(),
    order: v.number(),
    sampleInput: v.optional(v.string()),
    sampleOutput: v.optional(v.string()),
    starterCode: v.optional(v.string()),
    contestTaskId: v.optional(v.number()),
    referer: v.optional(v.string()),
    publicRepositoryUrl: v.optional(v.string()),
    evaluationImage: v.optional(v.string()),
    baseCommit: v.optional(v.string()),
    defaultSubmissionRef: v.optional(v.string()),
    extraDockerEnvVars: v.optional(v.string()),
    judgeFilePath: v.optional(v.string()),
    evaluationCommand: v.optional(v.string()),
    starterSubmission: v.optional(v.string()),
    downloadableFilePath: v.optional(v.string()),
    externalLink: v.optional(v.string()),
    flagHash: v.optional(v.string()),
    briefDownloadUrl: v.optional(v.string()),
    depotClosesAt: v.optional(v.number()),
    customTextFields: v.optional(v.array(mainProjectCustomTextFieldValidator)),
    evaluationCriteria: v.optional(v.array(mainProjectEvaluationCriterionValidator)),
    isOffline: v.optional(v.boolean()),
    offlineTaskPreDescription: v.optional(v.string()),
    leaderboardVisible: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdminOrService(ctx);

    if (args.trackSlug === "software-engineering") {
      assertSoftwareEngineeringExtraDockerEnvVars(args.extraDockerEnvVars);

      const existing = await ctx.db
        .query("trackProblems")
        .withIndex("by_trackSlug", (q) => q.eq("trackSlug", args.trackSlug))
        .collect();

      if (existing.length > 0) {
        throw new Error(
          "The software engineering track supports a single challenge only."
        );
      }
    }

    if (args.trackSlug === "logic-reverse-engineering") {
      assertLogicReverseEngineeringConfig(args);
    }

    if (args.trackSlug === "ctf" && !args.flagHash?.trim()) {
      throw new Error("CTF flag hash is required.");
    }

    if (args.trackSlug === "main-project") {
      assertMainProjectCustomTextFields(args.customTextFields);
      assertMainProjectEvaluationCriteria(args.evaluationCriteria);
    }

    const problemId = await ctx.db.insert("trackProblems", {
      trackSlug: args.trackSlug,
      slug: args.slug,
      name: args.name,
      description: args.description,
      points: args.points,
      order: args.order,
      isOffline: args.isOffline,
      offlineTaskPreDescription: args.offlineTaskPreDescription,
      leaderboardVisible: args.leaderboardVisible,
    });

    if (args.trackSlug === "algorithmics") {
      await upsertAlgorithmicsConfig(ctx, problemId, {
        sampleInput: args.sampleInput,
        sampleOutput: args.sampleOutput,
        starterCode: args.starterCode,
        contestTaskId: args.contestTaskId,
        referer: args.referer,
      });
    }

    if (args.trackSlug === "software-engineering") {
      await upsertSoftwareEngineeringConfig(ctx, problemId, {
        publicRepositoryUrl: args.publicRepositoryUrl,
        evaluationImage: args.evaluationImage,
        baseCommit: args.baseCommit,
        defaultSubmissionRef: args.defaultSubmissionRef,
        extraDockerEnvVars: args.extraDockerEnvVars,
      });
    }

    if (args.trackSlug === "logic-reverse-engineering") {
      await upsertLogicReverseEngineeringConfig(ctx, problemId, {
        judgeFilePath: args.judgeFilePath,
        evaluationImage: args.evaluationImage,
        evaluationCommand: args.evaluationCommand,
        starterSubmission: args.starterSubmission,
      });
    }

    if (args.trackSlug === "ctf") {
      await upsertCtfConfig(ctx, problemId, {
        downloadableFilePath: args.downloadableFilePath,
        externalLink: args.externalLink,
        flagHash: args.flagHash,
      });
    }

    if (args.trackSlug === "main-project") {
      await upsertMainProjectConfig(ctx, problemId, {
        briefDownloadUrl: args.briefDownloadUrl,
        customTextFields: args.customTextFields,
        evaluationCriteria: args.evaluationCriteria,
      });

      const createdProblem = await ctx.db.get(problemId);
      const createdConfig = await getMainProjectConfigByProblemId(ctx, problemId);
      if (createdProblem) {
        await syncMainProjectEvaluationScoresForProblem(
          ctx,
          createdProblem,
          createdConfig?.evaluationCriteria
        );
      }
    }

    await insertProblemAvailabilityNotification(
      ctx,
      {
        trackSlug: args.trackSlug,
        slug: args.slug,
        name: args.name,
      },
      true
    );

    return problemId;
  },
});

export const update = mutation({
  args: {
    id: v.id("trackProblems"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    points: v.optional(v.number()),
    order: v.optional(v.number()),
    sampleInput: v.optional(v.string()),
    sampleOutput: v.optional(v.string()),
    starterCode: v.optional(v.string()),
    contestTaskId: v.optional(v.number()),
    referer: v.optional(v.string()),
    publicRepositoryUrl: v.optional(v.string()),
    evaluationImage: v.optional(v.string()),
    baseCommit: v.optional(v.string()),
    defaultSubmissionRef: v.optional(v.string()),
    extraDockerEnvVars: v.optional(v.string()),
    judgeFilePath: v.optional(v.string()),
    evaluationCommand: v.optional(v.string()),
    starterSubmission: v.optional(v.string()),
    downloadableFilePath: v.optional(v.string()),
    externalLink: v.optional(v.string()),
    flagHash: v.optional(v.string()),
    briefDownloadUrl: v.optional(v.string()),
    depotClosesAt: v.optional(v.number()),
    customTextFields: v.optional(v.array(mainProjectCustomTextFieldValidator)),
    evaluationCriteria: v.optional(v.array(mainProjectEvaluationCriterionValidator)),
    isOffline: v.optional(v.boolean()),
    offlineTaskPreDescription: v.optional(v.string()),
    leaderboardVisible: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...fields }) => {
    await requireAdminOrService(ctx);

    const problem = await ctx.db.get(id);

    if (!problem) {
      throw new Error("Problem not found.");
    }

    const existingLogicConfig =
      problem.trackSlug === "logic-reverse-engineering"
        ? await getLogicReverseEngineeringConfigByProblemId(ctx, id)
        : null;

    if (problem.trackSlug === "logic-reverse-engineering") {
      assertLogicReverseEngineeringConfig(fields, existingLogicConfig);
    }

    if (problem.trackSlug === "software-engineering") {
      assertSoftwareEngineeringExtraDockerEnvVars(fields.extraDockerEnvVars);
    }

    if (problem.trackSlug === "main-project") {
      assertMainProjectCustomTextFields(fields.customTextFields);
      assertMainProjectEvaluationCriteria(fields.evaluationCriteria);
    }

    const sharedFields = cleanFields({
      name: fields.name,
      description: fields.description,
      points: fields.points,
      order: fields.order,
      isOffline: fields.isOffline,
      offlineTaskPreDescription: fields.offlineTaskPreDescription,
      leaderboardVisible: fields.leaderboardVisible,
    });

    if (Object.keys(sharedFields).length > 0) {
      await ctx.db.patch(id, sharedFields);
    }

    if (problem.trackSlug === "algorithmics") {
      await upsertAlgorithmicsConfig(ctx, id, {
        sampleInput: fields.sampleInput,
        sampleOutput: fields.sampleOutput,
        starterCode: fields.starterCode,
        contestTaskId: fields.contestTaskId,
        referer: fields.referer,
      });
    }

    if (problem.trackSlug === "software-engineering") {
      await upsertSoftwareEngineeringConfig(ctx, id, {
        publicRepositoryUrl: fields.publicRepositoryUrl,
        evaluationImage: fields.evaluationImage,
        baseCommit: fields.baseCommit,
        defaultSubmissionRef: fields.defaultSubmissionRef,
        extraDockerEnvVars: fields.extraDockerEnvVars,
      });
    }

    if (problem.trackSlug === "logic-reverse-engineering") {
      await upsertLogicReverseEngineeringConfig(ctx, id, {
        judgeFilePath: fields.judgeFilePath,
        evaluationImage: fields.evaluationImage,
        evaluationCommand: fields.evaluationCommand,
        starterSubmission: fields.starterSubmission,
      });
    }

    if (problem.trackSlug === "ctf") {
      await upsertCtfConfig(ctx, id, {
        downloadableFilePath: fields.downloadableFilePath,
        externalLink: fields.externalLink,
        flagHash: fields.flagHash,
      });
    }

    if (problem.trackSlug === "main-project") {
      await upsertMainProjectConfig(ctx, id, {
        briefDownloadUrl: fields.briefDownloadUrl,
        depotClosesAt: fields.depotClosesAt,
        customTextFields: fields.customTextFields,
        evaluationCriteria: fields.evaluationCriteria,
      });

      const updatedProblem = await ctx.db.get(id);
      const updatedConfig = await getMainProjectConfigByProblemId(ctx, id);
      if (updatedProblem) {
        await syncMainProjectEvaluationScoresForProblem(
          ctx,
          updatedProblem,
          updatedConfig?.evaluationCriteria
        );
      }
    }
  },
});

export const remove = mutation({
  args: { id: v.id("trackProblems") },
  handler: async (ctx, { id }) => {
    await requireAdminOrService(ctx);

    const problem = await ctx.db.get(id);

    if (!problem) {
      return;
    }

    await deleteTrackSpecificConfig(ctx, problem);
    await ctx.db.delete(id);
  },
});

export const clearByTrack = mutation({
  args: { trackSlug: v.string() },
  handler: async (ctx, { trackSlug }) => {
    await requireAdminOrService(ctx);

    const problems = await ctx.db
      .query("trackProblems")
      .withIndex("by_trackSlug", (q) => q.eq("trackSlug", trackSlug))
      .collect();
    for (const p of problems) {
      await deleteTrackSpecificConfig(ctx, p);
      await ctx.db.delete(p._id);
    }
    return problems.length;
  },
});

export const setActive = mutation({
  args: { id: v.id("trackProblems"), isActive: v.boolean() },
  handler: async (ctx, { id, isActive }) => {
    await requireAdminOrService(ctx);
    const problem = await ctx.db.get(id);

    if (!problem) {
      throw new Error("Problem not found.");
    }

    const previousEffectiveState = problem.isActive !== false;

    await ctx.db.patch(id, { isActive });

    if (previousEffectiveState !== isActive) {
      await insertProblemAvailabilityNotification(ctx, problem, isActive);
    }
  },
});

export const setLeaderboardVisible = mutation({
  args: { id: v.id("trackProblems"), leaderboardVisible: v.boolean() },
  handler: async (ctx, { id, leaderboardVisible }) => {
    await requireAdminOrService(ctx);

    const problem = await ctx.db.get(id);

    if (!problem) {
      throw new Error("Problem not found.");
    }

    await ctx.db.patch(id, { leaderboardVisible });
  },
});

