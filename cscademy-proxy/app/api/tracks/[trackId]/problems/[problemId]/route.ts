import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { isOfflineSessionStale } from "@/lib/offline-problem-access";
import { normalizeOfflineGatewayUrl } from "@/lib/offline-gateway";
import { getOfflineAntiCheatCanaryImageUrl } from "@/lib/offline-anti-cheat-server";

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

  const [user, problem, session] = await Promise.all([
    convex.query(api.users.getById, { id: userId }),
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

  if (!user?.offlineGatewayUrl) {
    return NextResponse.json({ error: "Problem not found" }, { status: 404 });
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
        antiCheatCanaryImageUrl:
          session.flagReason ? undefined : getOfflineAntiCheatCanaryImageUrl() ?? undefined,
      },
    });
  }

  return NextResponse.json({
    status: "offline_confirmation",
    gatewayUrl: normalizeOfflineGatewayUrl(user.offlineGatewayUrl),
    problem: {
      slug: problem.slug,
      name: problem.name,
      points: problem.points,
      isOffline: true,
    },
  });
}