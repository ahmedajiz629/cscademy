import { NextRequest, NextResponse } from "next/server";
import { runCode, ensureSession, isWebSocketConnected } from "@/lib/csacademy";

export async function POST(req: NextRequest) {
  try {
    console.log("[API/run] POST — run request received");
    await ensureSession();
    console.log(`[API/run] Session ready, WebSocket: ${isWebSocketConnected() ? "connected" : "DISCONNECTED"}`);

    const body = await req.json();
    const {
      contestTaskId,
      sourceCode,
      input = "",
      referer = "",
      programmingLanguageId = "1",
    } = body;

    if (!contestTaskId || !sourceCode) {
      return NextResponse.json(
        { error: "contestTaskId and sourceCode are required" },
        { status: 400 }
      );
    }

    const result = await runCode(
      Number(contestTaskId),
      sourceCode,
      input,
      referer,
      programmingLanguageId
    );

    if (result?.error) {
      return NextResponse.json({ error: result.error });
    }

    return NextResponse.json({ results: result });
  } catch (error: any) {
    console.error("[API/run] Error:", error);
    return NextResponse.json(
      { error: error.message || "Run failed" },
      { status: 500 }
    );
  }
}
