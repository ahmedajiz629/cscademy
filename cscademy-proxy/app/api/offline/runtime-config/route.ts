import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getOfflineProbeImageUrl } from "@/lib/offline-anti-cheat-server";

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    probeImageUrl: getOfflineProbeImageUrl(),
  });
}