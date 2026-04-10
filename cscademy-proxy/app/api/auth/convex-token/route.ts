import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getAuthUser } from "@/lib/auth";
import { createConvexUserToken } from "@/lib/convex-auth";
import { getConvexServiceClient } from "@/lib/convex-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await getAuthUser(req);

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const convex = await getConvexServiceClient("auth-token");
    const user = await convex.query(api.users.getById, {
      id: auth.userId as Id<"users">,
    });

    if (!user || user.isActive !== true) {
      const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      response.cookies.delete("auth-token");
      return response;
    }

    const token = await createConvexUserToken({
      userId: user._id,
      role: user.role,
      email: user.email,
    });

    return NextResponse.json({ token });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to create Convex token." },
      { status: 500 }
    );
  }
}