import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import type { DataModel, Id } from "./_generated/dataModel";

export type ConvexRole = "admin" | "student" | "service";

type AuthCtx =
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>;

export interface ConvexIdentity {
  role: ConvexRole;
  userId?: Id<"users">;
  email?: string;
  service?: string;
  subject: string;
}

export async function getConvexIdentity(
  ctx: AuthCtx
): Promise<ConvexIdentity | null> {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    return null;
  }

  return {
    role: identity.role as ConvexRole,
    userId: identity.userId as Id<"users"> | undefined,
    email: identity.email as string | undefined,
    service: identity.service as string | undefined,
    subject: identity.subject,
  };
}

export async function requireIdentity(ctx: AuthCtx): Promise<ConvexIdentity> {
  const identity = await getConvexIdentity(ctx);

  if (!identity) {
    throw new Error("Unauthorized");
  }

  return identity;
}

export async function requireRole(
  ctx: AuthCtx,
  roles: ConvexRole[]
): Promise<ConvexIdentity> {
  const identity = await requireIdentity(ctx);

  if (!roles.includes(identity.role)) {
    throw new Error("Forbidden");
  }

  return identity;
}

export async function requireAdminOrService(ctx: AuthCtx) {
  return requireRole(ctx, ["admin", "service"]);
}

export async function requireService(ctx: AuthCtx) {
  return requireRole(ctx, ["service"]);
}

export async function requireSelfOrAdminOrService(
  ctx: AuthCtx,
  userId: Id<"users">
) {
  const identity = await requireIdentity(ctx);

  if (identity.role === "admin" || identity.role === "service") {
    return identity;
  }

  if (identity.userId === userId) {
    return identity;
  }

  throw new Error("Forbidden");
}