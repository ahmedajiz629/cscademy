import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getConvexUserClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { encryptCtfFlag } from "@/lib/ctf-flag-crypto";

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || auth.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const convex = await getConvexUserClient(auth);

    const problemId = await convex.mutation(
      api.trackProblems.create,
      {
        trackSlug: "ctf",
        slug: String(body.slug ?? "").trim(),
        name: String(body.name ?? "").trim(),
        description: String(body.description ?? "").trim(),
        points: Number(body.points),
        order: Number(body.order),
        downloadableFilePath: String(body.downloadableFilePath ?? "").trim(),
        externalLink: String(body.externalLink ?? "").trim(),
        encryptedFlag: encryptCtfFlag(String(body.flag ?? "")),
        isOffline: Boolean(body.isOffline),
      }
    );

    return NextResponse.json({ problemId });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to create CTF problem." },
      { status: 500 }
    );
  }
}