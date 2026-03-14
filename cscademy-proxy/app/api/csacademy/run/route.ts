import { NextRequest, NextResponse } from "next/server";
import { runCode, isLoggedIn, login } from "@/lib/csacademy";

export async function POST(req: NextRequest) {
  try {
    // Auto-login if not logged in
    if (!isLoggedIn()) {
      const email = process.env.CSACADEMY_EMAIL;
      const password = process.env.CSACADEMY_PASSWORD;
      if (!email || !password) {
        return NextResponse.json(
          { error: "Not logged in. Call /api/csacademy/login first or set env vars." },
          { status: 401 }
        );
      }
      await login(email, password);
    }

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
