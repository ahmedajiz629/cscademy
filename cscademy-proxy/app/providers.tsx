"use client";

import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { usePathname } from "next/navigation";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL!;

let convexClient: ConvexReactClient | null = null;

function getConvexClient() {
  if (!convexClient && convexUrl) {
    convexClient = new ConvexReactClient(convexUrl);
  }
  return convexClient;
}

function useCookieBackedConvexAuth() {
  const pathname = usePathname();
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">(
    "loading"
  );

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      const response = await fetch("/api/auth/convex-token", {
        cache: "no-store",
        headers: forceRefreshToken
          ? { "x-convex-token-refresh": "1" }
          : undefined,
      });

      if (!response.ok) {
        setStatus("unauthenticated");
        return null;
      }

      const data = await response.json();
      const token = typeof data.token === "string" ? data.token : null;

      setStatus(token ? "authenticated" : "unauthenticated");
      return token;
    },
    []
  );

  useEffect(() => {
    let cancelled = false;

    setStatus("loading");

    fetchAccessToken({ forceRefreshToken: false })
      .then((token) => {
        if (!cancelled) {
          setStatus(token ? "authenticated" : "unauthenticated");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("unauthenticated");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchAccessToken, pathname]);

  return useMemo(
    () => ({
      isLoading: status === "loading",
      isAuthenticated: status === "authenticated",
      fetchAccessToken,
    }),
    [fetchAccessToken, status]
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const client = getConvexClient();
  const useAuth = useCookieBackedConvexAuth;

  // If Convex is not configured, render without provider
  if (!client) {
    return <>{children}</>;
  }

  return (
    <ConvexProviderWithAuth client={client} useAuth={useAuth}>
      {children}
    </ConvexProviderWithAuth>
  );
}
