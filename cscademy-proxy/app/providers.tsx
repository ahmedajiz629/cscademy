"use client";

import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { usePathname } from "next/navigation";
import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";

const configuredConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL?.trim() ?? "";

const convexClients = new Map<string, ConvexReactClient>();

function serializeConvexUrl(url: URL) {
  const normalizedPath = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
  return `${url.origin}${normalizedPath}${url.search}${url.hash}`;
}

function resolveBrowserConvexUrl(): string | null {
  if (!configuredConvexUrl) {
    return null;
  }

  if (typeof window === "undefined") {
    return configuredConvexUrl;
  }

  try {
    const resolvedUrl = new URL(configuredConvexUrl, window.location.origin);
    const shouldUseCurrentOrigin =
      configuredConvexUrl.startsWith("/") ||
      (resolvedUrl.origin !== window.location.origin &&
        resolvedUrl.pathname !== "/" &&
        resolvedUrl.pathname !== "");

    if (!shouldUseCurrentOrigin) {
      return serializeConvexUrl(resolvedUrl);
    }

    const originBoundUrl = new URL(window.location.origin);
    originBoundUrl.pathname = resolvedUrl.pathname;
    originBoundUrl.search = resolvedUrl.search;
    originBoundUrl.hash = resolvedUrl.hash;
    return serializeConvexUrl(originBoundUrl);
  } catch {
    return configuredConvexUrl;
  }
}

function getConvexClient(convexUrl: string | null) {
  if (!convexUrl) {
    return null;
  }

  let client = convexClients.get(convexUrl);

  if (!client) {
    client = new ConvexReactClient(convexUrl);
    convexClients.set(convexUrl, client);
  }

  return client;
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
  const client = useMemo(
    () => getConvexClient(resolveBrowserConvexUrl()),
    []
  );
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
