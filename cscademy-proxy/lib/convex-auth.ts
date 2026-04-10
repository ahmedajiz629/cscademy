import { SignJWT, importPKCS8 } from "jose";
import type { AuthPayload } from "@/lib/auth";

export type ConvexAuthRole = "admin" | "student" | "service";

type ConvexAuthAlgorithm = "RS256" | "ES256";

function normalizeMultilineEnv(value: string) {
  return value.replace(/\\n/g, "\n").trim();
}

function getAlgorithm(): ConvexAuthAlgorithm {
  return process.env.CONVEX_AUTH_ALGORITHM === "ES256" ? "ES256" : "RS256";
}

function getIssuer() {
  return process.env.CONVEX_AUTH_ISSUER || "ajiz-tech-challenge-convex";
}

function getAudience() {
  return process.env.CONVEX_AUTH_AUDIENCE || "ajiz-tech-challenge";
}

function decodeJwksJson() {
  const rawJwks = process.env.CONVEX_AUTH_JWKS;

  if (!rawJwks) {
    throw new Error("CONVEX_AUTH_JWKS must be configured.");
  }

  if (!rawJwks.startsWith("data:")) {
    return rawJwks;
  }

  const [, encoded = ""] = rawJwks.split(",", 2);
  const isBase64 = rawJwks.includes(";base64,");

  return Buffer.from(encoded, isBase64 ? "base64" : "utf8").toString("utf8");
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
    const privateKeyPem = process.env.CONVEX_AUTH_PRIVATE_KEY;

    if (!privateKeyPem) {
      throw new Error("CONVEX_AUTH_PRIVATE_KEY must be configured.");
    }

    privateKeyPromise = importPKCS8(
      normalizeMultilineEnv(privateKeyPem),
      getAlgorithm()
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
      alg: getAlgorithm(),
      typ: "JWT",
      kid: getKeyId(),
    })
    .setSubject(subject)
    .setIssuer(getIssuer())
    .setAudience(getAudience())
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