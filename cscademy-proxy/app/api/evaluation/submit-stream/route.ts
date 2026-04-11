import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getConvexServiceClient } from "@/lib/convex-server";
import { csaManager } from "@/lib/csacademy-manager";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getRuntimeProblemAccess } from "@/lib/offline-problem-access";

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const convex = await getConvexServiceClient("evaluation-stream");
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

    const csaEmail = csaAccount.csaEmail;

    let jobId: string;
    try {
      jobId = await csaManager.submitJobStart(
        csaEmail,
        csaAccount.csaPassword,
        access.problem.contestTaskId,
        sourceCode,
        access.problem.referer || "",
        programmingLanguageId
      );
    } catch (err: any) {
      return NextResponse.json(
        { error: err.message || "Failed to start evaluation job" },
        { status: 500 }
      );
    }

    const encoder = new TextEncoder();
    const userId = auth.userId as Id<"users">;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
          } catch {
            // Controller already closed
          }
        };

        const startTime = Date.now();
        const MAX_WAIT_MS = 125_000;
        let lastTestCount = 0;
        let scoreRecorded = false;

        try {
          while (true) {
            if (Date.now() - startTime > MAX_WAIT_MS) {
              send({ type: "error", message: "Timeout waiting for evaluation results" });
              break;
            }

            const state = csaManager.peekJob(csaEmail, jobId);
            if (state) {
              // Stream any new test results
              for (let i = lastTestCount; i < state.tests.length; i++) {
                send({ type: "test", index: i + 1, test: state.tests[i] });
              }
              lastTestCount = state.tests.length;

              if (state.done) {
                const finalScore = state.score ?? null;

                if (!scoreRecorded && finalScore !== null) {
                  scoreRecorded = true;
                  try {
                    await convex.mutation(api.scores.upsert, {
                      userId,
                      trackSlug,
                      problemSlug,
                      score: finalScore,
                    });
                  } catch (e: any) {
                    console.error("[API/submit-stream] Score save error:", e.message);
                  }
                }

                send({ type: "done", score: finalScore, totalTests: state.tests.length });
                csaManager.releaseJob(csaEmail, jobId);
                break;
              }
            }

            await sleep(300);
          }
        } catch (err: any) {
          send({ type: "error", message: err.message || "Streaming evaluation failed" });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: any) {
    console.error("[API/submit-stream] Error:", error);
    return NextResponse.json(
      { error: error.message || "Submit failed" },
      { status: 500 }
    );
  }
}
