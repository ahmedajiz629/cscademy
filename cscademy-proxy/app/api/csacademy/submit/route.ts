import { NextRequest, NextResponse } from "next/server";
import { submitCode, ensureSession, isWebSocketConnected } from "@/lib/csacademy";

export async function POST(req: NextRequest) {
  try {
    console.log("[API/submit] POST — submit request received");
    await ensureSession();
    console.log(`[API/submit] Session ready, WebSocket: ${isWebSocketConnected() ? "connected" : "DISCONNECTED"}`);

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

    const result = await submitCode(
      Number(contestTaskId),
      sourceCode,
      referer,
      programmingLanguageId
    );

    return NextResponse.json({ results: result });
  } catch (error: any) {
    console.error("[API/submit] Error:", error);
    return NextResponse.json(
      { error: error.message || "Submit failed" },
      { status: 500 }
    );
  }
}
