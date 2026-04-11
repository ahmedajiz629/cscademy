import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getTrackAccess } from "@/lib/tracks/access";
import { isOfflineSessionStale } from "@/lib/offline-session";

export async function getRuntimeProblemAccess(
  convex: ConvexHttpClient,
  userId: Id<"users">,
  trackSlug: string,
  problemSlug: string
) {
  const trackAccess = await getTrackAccess(convex, trackSlug);

  if (!trackAccess || !trackAccess.isVisible) {
    return {
      allowed: false as const,
      reason: "not_found" as const,
      problem: null,
      session: null,
    };
  }

  const problem = await convex.query(api.trackProblems.getBySlugAdmin, {
    trackSlug,
    slug: problemSlug,
  });

  if (!problem) {
    return {
      allowed: false as const,
      reason: "not_found" as const,
      problem: null,
      session: null,
    };
  }

  if (problem.isOffline !== true) {
    return {
      allowed: true as const,
      reason: "online" as const,
      problem,
      session: null,
    };
  }

  const session = await convex.query(api.offlineProblemSessions.getByUserAndProblem, {
    userId,
    trackSlug,
    problemSlug,
  });

  if (session?.status === "terminated") {
    return {
      allowed: false as const,
      reason: "closed" as const,
      problem,
      session,
    };
  }

  if (isOfflineSessionStale(session)) {
    return {
      allowed: false as const,
      reason: "closed" as const,
      problem,
      session,
    };
  }

  if (session?.status === "active") {
    return {
      allowed: true as const,
      reason: "active" as const,
      problem,
      session,
    };
  }

  return {
    allowed: false as const,
    reason: "inactive" as const,
    problem,
    session,
  };
}