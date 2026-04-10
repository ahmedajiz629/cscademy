import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getConvexUserClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth || auth.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  try {
    const convex = await getConvexUserClient(auth);
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