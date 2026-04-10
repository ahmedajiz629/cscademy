/**
 * Server-side Convex client for use in API routes.
 */
import { ConvexHttpClient } from "convex/browser";
import type { AuthPayload } from "@/lib/auth";
import {
  createConvexServiceToken,
  createConvexUserToken,
} from "@/lib/convex-auth";

function getConvexUrl() {
  const url = process.env.CONVEX_INTERNAL_URL || process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!url) {
    throw new Error("CONVEX_INTERNAL_URL or NEXT_PUBLIC_CONVEX_URL not set");
  }

  return url;
}

export function getConvexClient(token?: string): ConvexHttpClient {
  if (token) {
    return new ConvexHttpClient(getConvexUrl(), { auth: token });
  }

  return new ConvexHttpClient(getConvexUrl());
}

export async function getConvexUserClient(auth: AuthPayload) {
  return getConvexClient(await createConvexUserToken(auth));
}

export async function getConvexServiceClient(service = "next-server") {
  return getConvexClient(await createConvexServiceToken(service));
}
