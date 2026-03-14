import { NextRequest, NextResponse } from "next/server";
import { login, getSession, isLoggedIn } from "@/lib/csacademy";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email =
      body.email || process.env.CSACADEMY_EMAIL || "";
    const password =
      body.password || process.env.CSACADEMY_PASSWORD || "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const session = await login(email, password);

    return NextResponse.json({
      success: true,
      userId: session.userId,
      workspaceId: session.workspaceId,
      sessionId: session.sessionId,
    });
  } catch (error: any) {
    console.error("[API/login] Error:", error);
    return NextResponse.json(
      { error: error.message || "Login failed" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    loggedIn: isLoggedIn(),
    session: isLoggedIn()
      ? {
          userId: getSession()?.userId,
          workspaceId: getSession()?.workspaceId,
        }
      : null,
  });
}
