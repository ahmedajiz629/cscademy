import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { isOfflineSessionStale } from "@/lib/offline-session";
import { canStartOfflineTaskFromUrl } from "@/lib/offline-gateway";
import { getOfflineProbeImageUrl } from "@/lib/offline-anti-cheat-server";
import { getTrackAccess } from "@/lib/tracks/access";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ trackId: string; problemId: string }> }
) {
  const auth = await getAuthUser(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { trackId, problemId } = await params;
  const userId = auth.userId as Id<"users">;
  const convex = getConvexClient();
  const trackAccess = await getTrackAccess(convex, trackId);

  if (!trackAccess || !trackAccess.isVisible) {
    return NextResponse.json({ error: "Problem not found" }, { status: 404 });
  }

  const [problem, session] = await Promise.all([
    convex.query(api.trackProblems.getBySlug, {
      trackSlug: trackId,
      slug: problemId,
    }),
    convex.query(api.offlineProblemSessions.getByUserAndProblem, {
      userId,
      trackSlug: trackId,
      problemSlug: problemId,
    }),
  ]);

  if (!problem) {
    return NextResponse.json({ error: "Problem not found" }, { status: 404 });
  }

  if (problem.isOffline !== true) {
    return NextResponse.json({ status: "ready", problem });
  }

  if (session?.status === "terminated" || isOfflineSessionStale(session)) {
    return NextResponse.json({
      status: "closed",
      problem: {
        slug: problem.slug,
        name: problem.name,
        points: problem.points,
        isOffline: true,
      },
      closedReason: session?.terminatedReason ?? "connection_lost",
    });
  }

  if (session?.status === "active") {
    return NextResponse.json({
      status: "ready",
      problem: {
        ...problem,
        probeImageUrl:
          session.flagReason ? undefined : getOfflineProbeImageUrl() ?? undefined,
      },
    });
  }

  const forwardedProto = req.headers.get("x-forwarded-proto") ?? undefined;

  return NextResponse.json({
    status: "offline_confirmation",
    canStartOfflineTask: canStartOfflineTaskFromUrl(req.nextUrl, forwardedProto),
    problem: {
      slug: problem.slug,
      name: problem.name,
      points: problem.points,
      isOffline: true,
    },
  });
}