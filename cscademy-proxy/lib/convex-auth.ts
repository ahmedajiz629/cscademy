import { SignJWT, importPKCS8 } from "jose";
import type { AuthPayload } from "@/lib/auth";

export type ConvexAuthRole = "admin" | "student" | "service";

type ConvexAuthAlgorithm = "RS256" | "ES256";

const CONVEX_AUTH_ALGORITHM: ConvexAuthAlgorithm = "RS256";
const CONVEX_AUTH_ISSUER = "https://ajiz-tech-challenge.invalid/convex";
const CONVEX_AUTH_AUDIENCE = "ajiz-tech-challenge";

function normalizeMultilineEnv(value: string) {
  return value.replace(/\\n/g, "\n").trim();
}

function getRequiredEnv(name: "CONVEX_AUTH_JWKS" | "CONVEX_AUTH_PRIVATE_KEY") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} must be configured.`);
  }

  return value;
}

function normalizeJwksValue(rawJwks: string) {
  const trimmed = rawJwks.trim();

  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "string" ? parsed : trimmed;
  } catch {
    return trimmed;
  }
}

function decodeJwksJson() {
  const rawJwks = getRequiredEnv("CONVEX_AUTH_JWKS");

  if (!rawJwks.startsWith("data:")) {
    return normalizeJwksValue(rawJwks);
  }

  const [, encoded = ""] = rawJwks.split(",", 2);
  const isBase64 = rawJwks.includes(";base64,");

  return normalizeJwksValue(
    isBase64
    ? Buffer.from(encoded, "base64").toString("utf8")
    : decodeURIComponent(encoded)
  );
}

function getKeyId() {
  const jwks = JSON.parse(decodeJwksJson()) as {
    keys?: Array<{ kid?: string }>;
  };
  const keyId = jwks.keys?.[0]?.kid;

  if (!keyId) {
    throw new Error("CONVEX_AUTH_JWKS must include a key id (kid).");
  }

  return keyId;
}

let privateKeyPromise: Promise<CryptoKey> | null = null;

async function getPrivateKey() {
  if (!privateKeyPromise) {
    const privateKeyPem = getRequiredEnv("CONVEX_AUTH_PRIVATE_KEY");

    privateKeyPromise = importPKCS8(
      normalizeMultilineEnv(privateKeyPem),
      CONVEX_AUTH_ALGORITHM
    );
  }

  return privateKeyPromise;
}

async function signConvexToken(
  claims: Record<string, string>,
  subject: string,
  expiresIn: string
) {
  return new SignJWT(claims)
    .setProtectedHeader({
      alg: CONVEX_AUTH_ALGORITHM,
      typ: "JWT",
      kid: getKeyId(),
    })
    .setSubject(subject)
    .setIssuer(CONVEX_AUTH_ISSUER)
    .setAudience(CONVEX_AUTH_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(await getPrivateKey());
}

export async function createConvexUserToken(auth: AuthPayload) {
  return signConvexToken(
    {
      role: auth.role,
      userId: auth.userId,
      email: auth.email,
    },
    `user:${auth.userId}`,
    "15m"
  );
}

export async function createConvexServiceToken(
  service: string,
  expiresIn = "12h"
) {
  return signConvexToken(
    {
      role: "service",
      service,
    },
    `service:${service}`,
    expiresIn
  );
}