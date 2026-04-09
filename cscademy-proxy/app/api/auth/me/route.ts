import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getConvexClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const convex = getConvexClient();
  const user = await convex.query(api.users.getById, {
    id: auth.userId as Id<"users">,
  });

  if (!user) {
    const res = NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
    res.cookies.delete("auth-token");
    return res;
  }

  return NextResponse.json({
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
}
