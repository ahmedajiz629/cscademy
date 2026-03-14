import { NextRequest, NextResponse } from "next/server";
import { login, ensureSession, getSession, isLoggedIn, isWebSocketConnected } from "@/lib/csacademy";

export async function POST(req: NextRequest) {
  console.log("[API/login] POST — login request received");
  try {
    const body = await req.json().catch(() => ({}));

    // If email+password provided, use programmatic login
    const email = body.email || "";
    const password = body.password || "";

    if (email && password) {
      console.log("[API/login] Using provided credentials");
      const session = await login(email, password);
      console.log("[API/login] Login success — userId:", session.userId);
      return NextResponse.json({
        success: true,
        userId: session.userId,
        workspaceId: session.workspaceId,
        sessionId: session.sessionId,
        wsConnected: isWebSocketConnected(),
      });
    }

    // Otherwise, use ensureSession (env login)
    console.log("[API/login] Using env credentials via ensureSession");
    const session = await ensureSession();
    console.log("[API/login] Login success — userId:", session.userId);
    return NextResponse.json({
      success: true,
      userId: session.userId,
      workspaceId: session.workspaceId,
      sessionId: session.sessionId,
      wsConnected: isWebSocketConnected(),
    });
  } catch (error: any) {
    console.error("[API/login] FAILED:", error.message);
    return NextResponse.json(
      { error: error.message || "Login failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const loggedIn = isLoggedIn();
  const wsConnected = isWebSocketConnected();
  const s = getSession();
  console.log(`[API/login] GET — loggedIn=${loggedIn} ws=${wsConnected} user=${s?.userId || "none"}`);
  return NextResponse.json({
    loggedIn,
    wsConnected,
    session: loggedIn
      ? {
          userId: s?.userId,
          workspaceId: s?.workspaceId,
          sessionId: s?.sessionId,
        }
      : null,
  });
}
