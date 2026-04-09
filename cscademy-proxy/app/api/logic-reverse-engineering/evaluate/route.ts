import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getTrackAccess } from "@/lib/tracks/access";
import {
  LogicReverseEngineeringValidationError,
  runLogicReverseEngineeringEvaluation,
} from "@/lib/logic-reverse-engineering-evaluator";

export const dynamic = "force-dynamic";

const TRACK_SLUG = "logic-reverse-engineering";

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const trackSlug = String(body.trackSlug ?? "").trim();
    const problemSlug = String(body.problemSlug ?? "").trim();
    const submission = String(body.submission ?? "");

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

    if (!submission.trim()) {
      return NextResponse.json(
        { error: "A non-empty submission string is required." },
        { status: 400 }
      );
    }

    const convex = getConvexClient();
    const trackAccess = await getTrackAccess(convex, trackSlug);
    if (!trackAccess || !trackAccess.isVisible) {
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }

    const problem = await convex.query(api.trackProblems.getBySlug, {
      trackSlug,
      slug: problemSlug,
    });

    if (!problem) {
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }

    const result = await runLogicReverseEngineeringEvaluation({
      submission,
      judgeFilePath: problem.judgeFilePath,
    });

    const score = result.status === "passed" ? problem.points : 0;
    if (result.status === "passed") {
      await convex.mutation(api.scores.upsert, {
        userId: auth.userId as Id<"users">,
        trackSlug,
        problemSlug,
        score,
      });
    }

    return NextResponse.json({
      results: {
        ...result,
        score,
      },
    });
  } catch (error: any) {
    if (error instanceof LogicReverseEngineeringValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("[API/logic-reverse-engineering/evaluate] Error:", error);
    return NextResponse.json(
      { error: error.message || "Evaluation failed" },
      { status: 500 }
    );
  }
}