import { query } from "./_generated/server";
import { v } from "convex/values";

function compareNames(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: "base" });
}

function toTrackLabel(trackSlug: string) {
  const labels: Record<string, string> = {
    algorithmics: "Algorithmics",
    "software-engineering": "Software Engineering",
    "logic-reverse-engineering": "Logic & Reverse Engineering",
    ctf: "CTF",
  };

  return labels[trackSlug] ?? trackSlug;
}

function rankEntries<T>(entries: T[]) {
  return entries.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}

export const getTrackScopeOptions = query({
  args: { trackSlug: v.string() },
  handler: async (ctx, { trackSlug }) => {
    const [trackSettings, problems] = await Promise.all([
      ctx.db
        .query("trackSettings")
        .withIndex("by_trackSlug", (q) => q.eq("trackSlug", trackSlug))
        .first(),
      ctx.db
        .query("trackProblems")
        .withIndex("by_trackSlug", (q) => q.eq("trackSlug", trackSlug))
        .collect(),
    ]);

    const problemOptions = problems
      .filter(
        (problem) => problem.isActive !== false && problem.leaderboardVisible === true
      )
      .sort((left, right) => {
        if (left.order !== right.order) {
          return left.order - right.order;
        }

        return compareNames(left.name, right.name);
      })
      .map((problem) => ({
        key: `problem:${problem.slug}`,
        type: "problem" as const,
        slug: problem.slug,
        name: problem.name,
      }));

    const options = [
      ...(trackSettings?.leaderboardVisible === true
        ? [
            {
              key: "track",
              type: "track" as const,
              name: `${toTrackLabel(trackSlug)} Overall`,
            },
          ]
        : []),
      ...problemOptions,
    ];

    return {
      trackSlug,
      trackName: toTrackLabel(trackSlug),
      trackLeaderboardVisible: trackSettings?.leaderboardVisible === true,
      leaderboardCoefficient: trackSettings?.leaderboardCoefficient ?? 1,
      options,
    };
  },
});

export const getGlobalScopeOptions = query({
  handler: async (ctx) => {
    const [platformSettings, trackSettings, problems] = await Promise.all([
      ctx.db
        .query("platformSettings")
        .withIndex("by_key", (q) => q.eq("key", "global"))
        .first(),
      ctx.db.query("trackSettings").collect(),
      ctx.db.query("trackProblems").collect(),
    ]);

    const settingsMap = new Map(trackSettings.map((entry) => [entry.trackSlug, entry]));
    const tracksWithProblemLeaderboard = new Set(
      problems
        .filter(
          (problem) => problem.isActive !== false && problem.leaderboardVisible === true
        )
        .map((problem) => problem.trackSlug)
    );

    const trackSlugs = new Set<string>();
    for (const [trackSlug, settings] of settingsMap) {
      if (settings.leaderboardVisible === true || tracksWithProblemLeaderboard.has(trackSlug)) {
        trackSlugs.add(trackSlug);
      }
    }
    for (const trackSlug of tracksWithProblemLeaderboard) {
      trackSlugs.add(trackSlug);
    }

    const tracks = Array.from(trackSlugs)
      .sort((left, right) => compareNames(toTrackLabel(left), toTrackLabel(right)))
      .map((trackSlug) => ({
        trackSlug,
        trackName: toTrackLabel(trackSlug),
      }));

    return {
      globalLeaderboardVisible: platformSettings?.globalLeaderboardVisible === true,
      tracks,
    };
  },
});

export const getProblemLeaderboard = query({
  args: { trackSlug: v.string(), problemSlug: v.string() },
  handler: async (ctx, { trackSlug, problemSlug }) => {
    const [problem, users, scores] = await Promise.all([
      ctx.db
        .query("trackProblems")
        .withIndex("by_trackSlug_slug", (q) =>
          q.eq("trackSlug", trackSlug).eq("slug", problemSlug)
        )
        .first(),
      ctx.db.query("users").collect(),
      ctx.db.query("scores").collect(),
    ]);

    if (!problem || problem.leaderboardVisible !== true) {
      return null;
    }

    const userMap = new Map(
      users
        .filter((user) => user.role === "student")
        .map((user) => [user._id, user])
    );

    const entries = scores
      .filter(
        (score) =>
          score.trackSlug === trackSlug && score.problemSlug === problemSlug && userMap.has(score.userId)
      )
      .map((score) => {
        const user = userMap.get(score.userId)!;

        return {
          userId: score.userId,
          userName: user.name,
          userEmail: user.email,
          score: score.score,
          attempts: score.attempts,
          lastAttemptAt: score.lastAttemptAt,
        };
      })
      .sort((left, right) => {
        if (left.score !== right.score) {
          return right.score - left.score;
        }

        if (left.lastAttemptAt !== right.lastAttemptAt) {
          return left.lastAttemptAt - right.lastAttemptAt;
        }

        return compareNames(left.userName, right.userName);
      });

    return {
      scope: "problem" as const,
      trackSlug,
      trackName: toTrackLabel(trackSlug),
      problemSlug,
      problemName: problem.name,
      points: problem.points,
      entries: rankEntries(entries),
    };
  },
});

export const getTrackLeaderboard = query({
  args: { trackSlug: v.string() },
  handler: async (ctx, { trackSlug }) => {
    const [trackSettings, users, scores, problems] = await Promise.all([
      ctx.db
        .query("trackSettings")
        .withIndex("by_trackSlug", (q) => q.eq("trackSlug", trackSlug))
        .first(),
      ctx.db.query("users").collect(),
      ctx.db.query("scores").collect(),
      ctx.db
        .query("trackProblems")
        .withIndex("by_trackSlug", (q) => q.eq("trackSlug", trackSlug))
        .collect(),
    ]);

    if (trackSettings?.leaderboardVisible !== true) {
      return null;
    }

    const studentMap = new Map(
      users
        .filter((user) => user.role === "student")
        .map((user) => [user._id, user])
    );

    const problemCount = problems.length;
    const pointsAvailable = problems.reduce((sum, problem) => sum + problem.points, 0);
    const entriesByUser = new Map<string, {
      userId: any;
      userName: string;
      userEmail: string;
      score: number;
      solvedProblems: number;
      attempts: number;
      lastAttemptAt: number;
    }>();

    for (const score of scores) {
      if (score.trackSlug !== trackSlug || !studentMap.has(score.userId)) {
        continue;
      }

      const user = studentMap.get(score.userId)!;
      const key = String(score.userId);
      const existing = entriesByUser.get(key);

      if (existing) {
        existing.score += score.score;
        existing.attempts += score.attempts;
        existing.solvedProblems += score.score > 0 ? 1 : 0;
        existing.lastAttemptAt = Math.max(existing.lastAttemptAt, score.lastAttemptAt);
        continue;
      }

      entriesByUser.set(key, {
        userId: score.userId,
        userName: user.name,
        userEmail: user.email,
        score: score.score,
        solvedProblems: score.score > 0 ? 1 : 0,
        attempts: score.attempts,
        lastAttemptAt: score.lastAttemptAt,
      });
    }

    const entries = Array.from(entriesByUser.values()).sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      if (left.solvedProblems !== right.solvedProblems) {
        return right.solvedProblems - left.solvedProblems;
      }

      if (left.lastAttemptAt !== right.lastAttemptAt) {
        return left.lastAttemptAt - right.lastAttemptAt;
      }

      return compareNames(left.userName, right.userName);
    });

    return {
      scope: "track" as const,
      trackSlug,
      trackName: toTrackLabel(trackSlug),
      coefficient: trackSettings?.leaderboardCoefficient ?? 1,
      problemCount,
      pointsAvailable,
      entries: rankEntries(entries),
    };
  },
});

export const getGlobalLeaderboard = query({
  handler: async (ctx) => {
    const [platformSettings, trackSettings, users, scores] = await Promise.all([
      ctx.db
        .query("platformSettings")
        .withIndex("by_key", (q) => q.eq("key", "global"))
        .first(),
      ctx.db.query("trackSettings").collect(),
      ctx.db.query("users").collect(),
      ctx.db.query("scores").collect(),
    ]);

    if (platformSettings?.globalLeaderboardVisible !== true) {
      return null;
    }

    const visibleTrackSlugs = new Set(
      trackSettings
        .filter((setting) => setting.leaderboardVisible === true)
        .map((setting) => setting.trackSlug)
    );
    const coefficientMap = new Map(
      trackSettings
        .filter((setting) => setting.leaderboardVisible === true)
        .map((setting) => [setting.trackSlug, setting.leaderboardCoefficient ?? 1])
    );
    const studentMap = new Map(
      users
        .filter((user) => user.role === "student")
        .map((user) => [user._id, user])
    );
    const studentByStringId = new Map(
      Array.from(studentMap.entries()).map(([id, user]) => [String(id), { id, user }])
    );

    const perUserTrackScores = new Map<string, number>();
    const perUserTrackLastAttempt = new Map<string, number>();
    const entriesByUser = new Map<string, {
      userId: any;
      userName: string;
      userEmail: string;
      weightedScore: number;
      rawScore: number;
      activeTracks: number;
      lastAttemptAt: number;
    }>();

    for (const score of scores) {
      if (!studentMap.has(score.userId) || !visibleTrackSlugs.has(score.trackSlug)) {
        continue;
      }

      const key = `${String(score.userId)}:${score.trackSlug}`;
      perUserTrackScores.set(key, (perUserTrackScores.get(key) ?? 0) + score.score);
      perUserTrackLastAttempt.set(
        key,
        Math.max(perUserTrackLastAttempt.get(key) ?? 0, score.lastAttemptAt)
      );
    }

    for (const [key, trackScore] of perUserTrackScores) {
      const [userId, trackSlug] = key.split(":");
      const studentEntry = studentByStringId.get(userId);
      if (!studentEntry) {
        continue;
      }

      const coefficient = coefficientMap.get(trackSlug) ?? 1;
      const existing = entriesByUser.get(userId);
      const lastAttemptAt = perUserTrackLastAttempt.get(key) ?? 0;

      if (existing) {
        existing.rawScore += trackScore;
        existing.weightedScore += trackScore * coefficient;
        existing.activeTracks += 1;
        existing.lastAttemptAt = Math.max(existing.lastAttemptAt, lastAttemptAt);
        continue;
      }

      entriesByUser.set(userId, {
        userId: studentEntry.id,
        userName: studentEntry.user.name,
        userEmail: studentEntry.user.email,
        rawScore: trackScore,
        weightedScore: trackScore * coefficient,
        activeTracks: 1,
        lastAttemptAt,
      });
    }

    const entries = Array.from(entriesByUser.values()).sort((left, right) => {
      if (left.weightedScore !== right.weightedScore) {
        return right.weightedScore - left.weightedScore;
      }

      if (left.rawScore !== right.rawScore) {
        return right.rawScore - left.rawScore;
      }

      if (left.lastAttemptAt !== right.lastAttemptAt) {
        return left.lastAttemptAt - right.lastAttemptAt;
      }

      return compareNames(left.userName, right.userName);
    });

    return {
      scope: "global" as const,
      entries: rankEntries(entries),
    };
  },
});