import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { canStartOfflineTaskFromUrl } from "@/lib/offline-gateway";
import { getOfflineProbeImageUrl } from "@/lib/offline-anti-cheat-server";

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const forwardedProto = req.headers.get("x-forwarded-proto") ?? undefined;

  return NextResponse.json({
    canStartOfflineTask: canStartOfflineTaskFromUrl(req.nextUrl, forwardedProto),
    probeImageUrl: getOfflineProbeImageUrl(),
  });
}