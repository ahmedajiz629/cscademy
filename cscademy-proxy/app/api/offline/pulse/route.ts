import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getConvexServiceClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getRuntimeProblemAccess } from "@/lib/offline-problem-access";
import { OFFLINE_ANTI_CHEAT_REASON } from "@/lib/offline-anti-cheat";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { trackSlug, problemSlug } = await req.json();
  if (!trackSlug || !problemSlug) {
    return NextResponse.json(
      { error: "trackSlug and problemSlug are required" },
      { status: 400 }
    );
  }

  const userId = auth.userId as Id<"users">;
  const convex = await getConvexServiceClient("offline-pulse");
  const access = await getRuntimeProblemAccess(convex, userId, trackSlug, problemSlug);

  if (!access.problem) {
    return NextResponse.json({ error: "Problem not found" }, { status: 404 });
  }

  if (access.problem.isOffline !== true) {
    return NextResponse.json(
      { error: "This problem is not LAN gated." },
      { status: 400 }
    );
  }

  if (access.reason === "closed") {
    return new NextResponse(null, { status: 204 });
  }

  if (access.reason !== "active" || !access.session) {
    return new NextResponse(null, { status: 204 });
  }

  await convex.mutation(
    api.offlineProblemSessions.flag,
    {
      sessionId: access.session.sessionId,
      reason: OFFLINE_ANTI_CHEAT_REASON,
    }
  );

  return new NextResponse(null, { status: 204 });
}