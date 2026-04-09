/**
 * Server-side Convex client for use in API routes.
 */
import { ConvexHttpClient } from "convex/browser";

let client: ConvexHttpClient | null = null;

export function getConvexClient(): ConvexHttpClient {
  if (!client) {
    const url =
      process.env.CONVEX_INTERNAL_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      throw new Error("CONVEX_INTERNAL_URL or NEXT_PUBLIC_CONVEX_URL not set");
    }
    client = new ConvexHttpClient(url);
  }
  return client;
}
