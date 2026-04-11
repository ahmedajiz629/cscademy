import { SignJWT, jwtVerify } from "jose";

const OFFLINE_GATEWAY_AUDIENCE = "offline-gateway";
const OFFLINE_GATEWAY_ISSUER = "ajiz-tech-challenge";

export interface OfflineGatewayTokenPayload {
  userId: string;
  trackSlug: string;
  problemSlug: string;
  sessionId: string;
}

function getOfflineGatewaySecret() {
  const secret = process.env.OFFLINE_GATEWAY_SECRET;
  if (!secret) throw new Error("OFFLINE_GATEWAY_SECRET must be set");
  return new TextEncoder().encode(secret);
}

export function normalizeOfflineGatewayUrl(rawValue: string): string {
  const value = rawValue.trim();
  if (!value) {
    throw new Error("Offline gateway URL is required.");
  }

  const withProtocol = /^[a-z]+:\/\//i.test(value) ? value : `ws://${value}`;
  const url = new URL(withProtocol);

  if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol === "https:") url.protocol = "wss:";

  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error("Offline gateway URL must use ws, wss, http, or https.");
  }

  if (url.pathname === "/") {
    url.pathname = "";
  }

  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function getSourceUrl(rawValue: string | URL, forwardedProto?: string): URL {
  const sourceUrl = new URL(rawValue.toString());
  const normalizedProto = forwardedProto?.split(",")[0]?.trim().toLowerCase();

  if (normalizedProto === "http" || normalizedProto === "https") {
    sourceUrl.protocol = `${normalizedProto}:`;
  }

  return sourceUrl;
}

function getRequiredOfflineGatewayPort() {
  const configuredPort = process.env.OFFLINE_GATEWAY_PORT?.trim();

  if (!configuredPort) {
    throw new Error("OFFLINE_GATEWAY_PORT must be configured.");
  }

  const parsedPort = Number(configuredPort);

  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    throw new Error("OFFLINE_GATEWAY_PORT must be a positive integer.");
  }

  return String(parsedPort);
}

function buildOriginBoundOfflineGatewayUrl(
  rawValue: string | URL,
  port: string,
  forwardedProto?: string
): string {
  const sourceUrl = getSourceUrl(rawValue, forwardedProto);
  sourceUrl.protocol = sourceUrl.protocol === "https:" ? "wss:" : "ws:";
  sourceUrl.port = port;
  sourceUrl.pathname = "";
  sourceUrl.search = "";
  sourceUrl.hash = "";
  return normalizeOfflineGatewayUrl(sourceUrl.toString());
}

export function canStartOfflineTaskFromUrl(
  rawValue: string | URL,
  forwardedProto?: string
): boolean {
  return getSourceUrl(rawValue, forwardedProto).protocol === "http:";
}

export function resolveOfflineGatewayUrl(
  requestUrl: string | URL,
  forwardedProto?: string
): string {
  return buildOriginBoundOfflineGatewayUrl(
    requestUrl,
    getRequiredOfflineGatewayPort(),
    forwardedProto
  );
}

export async function createOfflineGatewayToken(
  payload: OfflineGatewayTokenPayload
) {
  return new SignJWT({ ...payload, kind: OFFLINE_GATEWAY_AUDIENCE })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(OFFLINE_GATEWAY_ISSUER)
    .setAudience(OFFLINE_GATEWAY_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(getOfflineGatewaySecret());
}

export async function verifyOfflineGatewayToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getOfflineGatewaySecret(), {
      issuer: OFFLINE_GATEWAY_ISSUER,
      audience: OFFLINE_GATEWAY_AUDIENCE,
    });

    if (payload.kind !== OFFLINE_GATEWAY_AUDIENCE) {
      return null;
    }

    return {
      userId: String(payload.userId),
      trackSlug: String(payload.trackSlug),
      problemSlug: String(payload.problemSlug),
      sessionId: String(payload.sessionId),
    } satisfies OfflineGatewayTokenPayload;
  } catch {
    return null;
  }
}