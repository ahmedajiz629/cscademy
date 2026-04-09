import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getConvexClient } from "@/lib/convex-server";
import { csaManager } from "@/lib/csacademy-manager";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getRuntimeProblemAccess } from "@/lib/offline-problem-access";

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const convex = getConvexClient();
    const csaAccount = await convex.query(api.csacademyAccounts.getByUserId, {
      userId: auth.userId as Id<"users">,
    });
    if (!csaAccount) {
      return NextResponse.json(
        { error: "No evaluation account linked. Contact your administrator." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      sourceCode,
      trackSlug,
      problemSlug,
      programmingLanguageId = "1",
    } = body;

    if (!trackSlug || !problemSlug || !sourceCode) {
      return NextResponse.json(
        { error: "trackSlug, problemSlug and sourceCode are required" },
        { status: 400 }
      );
    }

    const access = await getRuntimeProblemAccess(
      convex,
      auth.userId as Id<"users">,
      trackSlug,
      problemSlug
    );

    if (!access.problem) {
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }

    if (access.reason === "closed") {
      return NextResponse.json(
        { error: "This offline task is closed. No further work can be made." },
        { status: 409 }
      );
    }

    if (access.reason === "inactive") {
      return NextResponse.json(
        { error: "This offline task has not been started yet." },
        { status: 409 }
      );
    }

    if (!access.allowed) {
      return NextResponse.json({ error: "Problem not found" }, { status: 404 });
    }

    if (!access.problem.contestTaskId) {
      return NextResponse.json(
        { error: "Problem is missing judge task configuration" },
        { status: 400 }
      );
    }

    const result = await csaManager.submitCode(
      csaAccount.csaEmail,
      csaAccount.csaPassword,
      access.problem.contestTaskId,
      sourceCode,
      access.problem.referer || "",
      programmingLanguageId
    );

    // Record score if available
    if (result?.score !== undefined) {
      try {
        await convex.mutation(api.scores.upsert, {
          userId: auth.userId as Id<"users">,
          trackSlug,
          problemSlug,
          score: result.score,
        });
      } catch (e: any) {
        console.error("[API/submit] Score save error:", e.message);
      }
    }

    return NextResponse.json({ results: result });
  } catch (error: any) {
    console.error("[API/submit] Error:", error);
    return NextResponse.json(
      { error: error.message || "Submit failed" },
      { status: 500 }
    );
  }
}
