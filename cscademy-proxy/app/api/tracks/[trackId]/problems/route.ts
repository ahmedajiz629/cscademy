import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { isOfflineSessionStale } from "@/lib/offline-session";
import { getTrackAccess } from "@/lib/tracks/access";

export const dynamic = "force-dynamic";

type OfflineStatus = "ready" | "pending" | "active" | "closed" | null;

type VisibleProblem = {
  slug: string;
  name: string;
  points: number;
  isOffline: boolean;
  offlineStatus: OfflineStatus;
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ trackId: string }> }
) {
  const auth = await getAuthUser(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { trackId } = await params;
  const userId = auth.userId as Id<"users">;
  const convex = getConvexClient();
  const trackAccess = await getTrackAccess(convex, trackId);

  if (!trackAccess || !trackAccess.isVisible) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const [problems, sessions] = await Promise.all([
    convex.query(api.trackProblems.listByTrack, { trackSlug: trackId }),
    convex.query(api.offlineProblemSessions.listByUserAndTrack, {
      userId,
      trackSlug: trackId,
    }),
  ]);

  const sessionByProblem = new Map(sessions.map((session) => [session.problemSlug, session]));

  const visibleProblems: VisibleProblem[] = [];

  for (const problem of problems) {
    if (problem.isOffline !== true) {
      visibleProblems.push({
        slug: problem.slug,
        name: problem.name,
        points: problem.points,
        isOffline: false,
        offlineStatus: null,
      });
      continue;
    }

    const session = sessionByProblem.get(problem.slug);
    const offlineStatus: OfflineStatus =
      session?.status === "terminated" || isOfflineSessionStale(session)
        ? "closed"
        : session?.status === "active"
          ? "active"
          : session?.status === "pending"
            ? "pending"
            : "ready";

    visibleProblems.push({
      slug: problem.slug,
      name: problem.name,
      points: problem.points,
      isOffline: true,
      offlineStatus,
    });
  }

  return NextResponse.json({ problems: visibleProblems });
}