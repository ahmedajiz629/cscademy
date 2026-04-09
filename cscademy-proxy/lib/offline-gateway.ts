import { SignJWT, jwtVerify } from "jose";

const DEFAULT_OFFLINE_GATEWAY_PORT = "8787";
const OFFLINE_GATEWAY_AUDIENCE = "offline-gateway";
const OFFLINE_GATEWAY_ISSUER = "cscademy-proxy";

export interface OfflineGatewayTokenPayload {
  userId: string;
  trackSlug: string;
  problemSlug: string;
  sessionId: string;
}

function getOfflineGatewaySecret() {
  const secret = process.env.OFFLINE_GATEWAY_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("OFFLINE_GATEWAY_SECRET or JWT_SECRET must be set");
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

  if (!url.port) {
    url.port = DEFAULT_OFFLINE_GATEWAY_PORT;
  }

  if (url.pathname === "/") {
    url.pathname = "";
  }

  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function resolveOfflineGatewayUrl(requestUrl: string | URL): string {
  const configuredValue = process.env.OFFLINE_GATEWAY_URL?.trim();
  if (configuredValue) {
    return normalizeOfflineGatewayUrl(configuredValue);
  }

  const sourceUrl = new URL(requestUrl.toString());
  sourceUrl.protocol = sourceUrl.protocol === "https:" ? "wss:" : "ws:";
  sourceUrl.port = process.env.OFFLINE_GATEWAY_PORT || DEFAULT_OFFLINE_GATEWAY_PORT;
  sourceUrl.pathname = "";
  sourceUrl.search = "";
  sourceUrl.hash = "";
  return normalizeOfflineGatewayUrl(sourceUrl.toString());
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