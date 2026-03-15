import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getConvexClient } from "@/lib/convex-server";
import { csaManager } from "@/lib/csacademy-manager";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

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
        { error: "No CSAcademy account linked. Contact your administrator." },
        { status: 400 }
      );
    }

    const body = await req.json();
    const {
      contestTaskId,
      sourceCode,
      referer = "",
      programmingLanguageId = "1",
    } = body;

    if (!contestTaskId || !sourceCode) {
      return NextResponse.json(
        { error: "contestTaskId and sourceCode are required" },
        { status: 400 }
      );
    }

    const result = await csaManager.submitCode(
      csaAccount.csaEmail,
      csaAccount.csaPassword,
      Number(contestTaskId),
      sourceCode,
      referer,
      programmingLanguageId
    );

    // Record score if available
    if (body.problemSlug && body.trackSlug && result?.score !== undefined) {
      try {
        await convex.mutation(api.scores.upsert, {
          userId: auth.userId as Id<"users">,
          trackSlug: body.trackSlug,
          problemSlug: body.problemSlug,
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
