import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getConvexServiceClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getTrackAccess } from "@/lib/tracks/access";
import {
  normalizeRepositoryUrl,
  normalizeSubmissionRef,
  runSoftwareEngineeringEvaluation,
  SoftwareEngineeringValidationError,
} from "@/lib/software-engineering-evaluator";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const trackSlug = String(body.trackSlug ?? "").trim();
    const problemSlug = String(body.problemSlug ?? "").trim();
    const repoUrlInput = String(body.repoUrl ?? "");
    const accessToken = String(body.accessToken ?? "").trim();
    const submissionRefInput = String(body.submissionRef ?? "");

    if (trackSlug !== "software-engineering") {
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

    if (!accessToken) {
      return NextResponse.json(
        { error: "A GitHub access token is required." },
        { status: 400 }
      );
    }

    const convex = await getConvexServiceClient("software-evaluation");
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

    if (!problem.evaluationImage || !problem.baseCommit) {
      return NextResponse.json(
        { error: "This challenge is not configured yet." },
        { status: 500 }
      );
    }

    const repoUrl = normalizeRepositoryUrl(repoUrlInput);
    const submissionRef = normalizeSubmissionRef(
      submissionRefInput,
      problem.defaultSubmissionRef || "challenge"
    );

    const result = await runSoftwareEngineeringEvaluation({
      repoUrl,
      submissionRef,
      baseCommit: problem.baseCommit,
      accessToken,
      image: problem.evaluationImage,
    });

    if (result.status === "passed") {
      await convex.mutation(
        api.scores.upsert,
        {
          userId: auth.userId as Id<"users">,
          trackSlug,
          problemSlug,
          score: result.score,
        }
      );
    }

    return NextResponse.json({ results: result });
  } catch (error: any) {
    if (error instanceof SoftwareEngineeringValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("[API/software-engineering/evaluate] Error:", error);
    return NextResponse.json(
      { error: error.message || "Evaluation failed" },
      { status: 500 }
    );
  }
}