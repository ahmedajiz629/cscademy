import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getConvexUserClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { hashCtfFlag } from "@/lib/ctf-flag-hash";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ problemId: string }> }
) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || auth.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { problemId } = await params;
    const rawFlag = String(body.flag ?? "").trim();
    const convex = await getConvexUserClient(auth);

    await convex.mutation(
      api.trackProblems.update,
      {
        id: problemId as Id<"trackProblems">,
        name: String(body.name ?? "").trim(),
        description: String(body.description ?? "").trim(),
        points: Number(body.points),
        order: Number(body.order),
        downloadableFilePath: String(body.downloadableFilePath ?? "").trim(),
        externalLink: String(body.externalLink ?? "").trim(),
        flagHash: rawFlag ? hashCtfFlag(rawFlag) : undefined,
        isOffline: Boolean(body.isOffline),
        offlineTaskPreDescription: Boolean(body.isOffline)
          ? String(body.offlineTaskPreDescription ?? "").trim()
          : "",
      }
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to update CTF problem." },
      { status: 500 }
    );
  }
}