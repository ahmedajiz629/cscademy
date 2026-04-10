import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getConvexServiceClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getTrackAccess } from "@/lib/tracks/access";
import { decryptCtfFlag } from "@/lib/ctf-flag-crypto";

export const dynamic = "force-dynamic";

const TRACK_SLUG = "ctf";

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const trackSlug = String(body.trackSlug ?? "").trim();
    const problemSlug = String(body.problemSlug ?? "").trim();
    const submittedFlag = String(body.flag ?? "").trim();

    if (trackSlug !== TRACK_SLUG) {
      return NextResponse.json(
        { error: "Unsupported track for this evaluator." },
        { status: 400 }
      );
    }

    if (!problemSlug) {
      return NextResponse.json(
        { error: "problemSlug is required." },
        { status: 400 }
      );
    }

    if (!submittedFlag) {
      return NextResponse.json(
        { error: "A non-empty flag is required." },
        { status: 400 }
      );
    }

    const convex = await getConvexServiceClient("ctf-submit");
    const trackAccess = await getTrackAccess(convex, trackSlug);
    if (!trackAccess || !trackAccess.isVisible) {
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }

    const validationData = await convex.query(api.trackProblems.getCtfValidationData, {
      slug: problemSlug,
    });

    if (!validationData) {
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }

    if (!validationData.encryptedFlag?.trim()) {
      return NextResponse.json(
        { error: "This challenge is not configured yet." },
        { status: 500 }
      );
    }

    const expectedFlag = decryptCtfFlag(validationData.encryptedFlag).trim();
    const passed = submittedFlag === expectedFlag;
    const score = passed ? validationData.points : 0;

    await convex.mutation(
      api.scores.upsert,
      {
        userId: auth.userId as Id<"users">,
        trackSlug,
        problemSlug,
        score,
      }
    );

    return NextResponse.json({
      results: {
        status: passed ? "passed" : "failed",
        score,
        reason: passed ? "Correct flag." : "Incorrect flag.",
      },
    });
  } catch (error: any) {
    console.error("[API/ctf/submit] Error:", error);
    return NextResponse.json(
      { error: error.message || "Evaluation failed" },
      { status: 500 }
    );
  }
}