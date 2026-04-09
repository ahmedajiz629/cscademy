import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  try {
    const convex = getConvexClient();
    const account = await convex.query(api.csacademyAccounts.getByUserId, {
      userId: userId as Id<"users">,
    });

    if (!account) {
      return NextResponse.json({ csaEmail: "", csaPassword: "" });
    }

    return NextResponse.json({
      csaEmail: account.csaEmail,
      csaPassword: account.csaPassword,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}