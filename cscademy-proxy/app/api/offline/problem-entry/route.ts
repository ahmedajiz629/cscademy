import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  createOfflineGatewayToken,
  resolveOfflineGatewayUrl,
} from "@/lib/offline-gateway";
import { getRuntimeProblemAccess } from "@/lib/offline-problem-access";

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
  const convex = getConvexClient();
  const access = await getRuntimeProblemAccess(convex, userId, trackSlug, problemSlug);

  if (!access.problem) {
    return NextResponse.json({ error: "Problem not found" }, { status: 404 });
  }

  if (access.problem.isOffline !== true) {
    return NextResponse.json(
      { error: "This problem does not require offline entry." },
      { status: 400 }
    );
  }

  if (access.reason === "closed") {
    return NextResponse.json(
      { error: "This offline task has already been closed." },
      { status: 409 }
    );
  }

  if (access.reason === "active") {
    return NextResponse.json(
      { error: "Offline task is already active." },
      { status: 409 }
    );
  }

  const sessionId = randomUUID();
  const gatewayUrl = resolveOfflineGatewayUrl(req.nextUrl);

  await convex.mutation(api.offlineProblemSessions.prepareEntry, {
    userId,
    trackSlug,
    problemSlug,
    sessionId,
    gatewayUrl,
  });

  const token = await createOfflineGatewayToken({
    userId: auth.userId,
    trackSlug,
    problemSlug,
    sessionId,
  });

  return NextResponse.json({ gatewayUrl, sessionId, token });
}