"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useState, useEffect } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL!;

let convexClient: ConvexReactClient | null = null;

function getConvexClient() {
  if (!convexClient && convexUrl) {
    convexClient = new ConvexReactClient(convexUrl);
  }
  return convexClient;
}

export function Providers({ children }: { children: ReactNode }) {
  const client = getConvexClient();

  // If Convex is not configured, render without provider
  if (!client) {
    return <>{children}</>;
  }

  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
