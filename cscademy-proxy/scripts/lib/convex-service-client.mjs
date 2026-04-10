import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { SignJWT, importPKCS8 } from "jose";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const shellEnvKeys = new Set(Object.keys(process.env));
const DEFAULT_CONVEX_AUTH_ALGORITHM = "RS256";
const DEFAULT_CONVEX_AUTH_ISSUER = "https://ajiz-tech-challenge.invalid/convex";
const DEFAULT_CONVEX_AUTH_AUDIENCE = "ajiz-tech-challenge";

const DEV_FALLBACK_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEuwIBADANBgkqhkiG9w0BAQEFAASCBKUwggShAgEAAoIBAQCjvuZ/bjXxyzyz
e1MkuTU/J5BogdeiLUBOH5bWHV0n9HexpoNGrUzHd4oC1U9hG/d3knx4Rp8hf7kn
4gfX3Ksv4wUGPflbOSA3rD93hCGx9jX2+VGtZMiTjMAWBXT2RGWHFFTMqzthPIrQ
HKKWnvPCs/N3/fRvAOU3Ey05VPBKZUGkwW6FgUvOriV3We0lLBLdRPvCg4xA6+D0
O9tN2iuZjsCxi0W9zH3g8y+6pxnCgpraDANlrY3x7Ldi1c5cjSSQ+yS7F+jAQ2dk
f7R2wSdHYWbv/bNxmBZ1jaKum0SpNrhkiXDU4T7ONIFcC4tduUs2zCCc5M8y+2D2
fy6NOmsxAgMBAAECgf9CjMxfZsY7Qp2l4XqdhHEi2uXkCx09/JMC6SK/balctNnK
Z905Q+KrVW+LpAqmg4/VsJ9SvpzfWzeVeLxXUVUkGdBYa0BBgP/NfpdiNE5XIqOs
Ksy1QHL8JxdEQlwKP0zMw0A4DJdjf8vvYLP8eNMspUEtlZ/Bm4/RlbIzImaksx5H
A7dkqj9xE8Edq/PGcCMMsxz5ps3s+jrddDTihVQhP9rOxkJOpXQCK/4QLAK+4WSR
D3Lkb4svsDO+IEX4Hv4xhUqpxF6ydMcJk8Ewvo9pYusYgoFE9AGe8XNO1YACQvnz
kM+/jZaZhZ5G9jzlT0liqXVAn066CcNaXLUs76ECgYEA0T971Zyof5wsEXojA8a8
8rX2zz7C3ilIKxLlCBxbQEkFF9iPO91m/yVF5hTurs5iV+HGde8zTMYBksZp3GmD
P/rXcjPgH5jOGq6Uy5t/5oWc56cDFyqDVn/YDWrnig+r4lLdM495tzBTYCbdMT6Q
0khFu8GloSDGSXODuzAcEhECgYEAyFTJxQ5AIMTied50zHIhofPP+O1vEEzEt8uV
VCtUGDn3PSomFNml3JZxKHfUD0IvZrmvsYW6vhvGbcObV1zHvP+9z0s2buRy/nam
6Gc0tAEKVL4en6aOtwXGd4Afw6Ocm76hrcWZYxe37zYckaXSmDZICaQG/D/Wx2zb
qfmjpyECgYEAzsYHHy2xrHita4/gLgkkCkwaWu3QLy1oLXh8bylmWv5NVCUiVawR
7avtiNHCk2dK80EelsgLT6CTSXFchvyVQJImeKoendqoQOGoFBPTrf728Euv2CKg
qsemvouXxmx6FCqCgEMVqhrNKUT+a31CKypUDpfrjnAOweKumDmQY6ECgYAmeCm6
3o6v/D7lWjOhovUUbYZtbeLbBXLtPHnzjNJ8SH1S0Io5jMYOAxG9zKz7NSF3H4c+
lsiSgzDqmRp2f0mX4KBpcy8DwnjWpqBMlq0HN//s4AlvbQOQ39oJzp/K6NtFCSlw
/jYDUmWu2PxJd8dmFV5mA4qX3AZ5i0zvahHkIQKBgG6JZZR8gwsDo1VnemaHZ8wD
/0XVMTIkNQTad5HTsodSjWrjRnJAFuioQ9THpk1+OHwe25lHCc+S/vfrj/deuZib
itpTb/xpADQnyRZ48RfVLI7NfdDFcO4BxXzr1aFIOa8jvNST4oqalmzRmA/lqYMh
ayW82UxnZYjMsMPXsRRe
-----END PRIVATE KEY-----`;

const DEV_FALLBACK_JWKS = JSON.stringify({
  keys: [
    {
      kty: "RSA",
      n: "o77mf2418cs8s3tTJLk1PyeQaIHXoi1ATh-W1h1dJ_R3saaDRq1Mx3eKAtVPYRv3d5J8eEafIX-5J-IH19yrL-MFBj35WzkgN6w_d4QhsfY19vlRrWTIk4zAFgV09kRlhxRUzKs7YTyK0Byilp7zwrPzd_30bwDlNxMtOVTwSmVBpMFuhYFLzq4ld1ntJSwS3UT7woOMQOvg9DvbTdormY7AsYtFvcx94PMvuqcZwoKa2gwDZa2N8ey3YtXOXI0kkPskuxfowENnZH-0dsEnR2Fm7_2zcZgWdY2irptEqTa4ZIlw1OE-zjSBXAuLXblLNswgnOTPMvtg9n8ujTprMQ",
      e: "AQAB",
      use: "sig",
      alg: "RS256",
      kid: "local-dev-rs256",
    },
  ],
});

let didLoadEnvFiles = false;
let privateKeyPromise = null;

function decodeEnvValue(rawValue) {
  const trimmed = rawValue.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    const unwrapped = trimmed.slice(1, -1);
    return trimmed.startsWith('"')
      ? unwrapped
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
      : unwrapped;
  }

  return trimmed;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const source = readFileSync(filePath, "utf8");
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    if (shellEnvKeys.has(key)) {
      continue;
    }

    process.env[key] = decodeEnvValue(rawValue);
  }
}

export function ensureScriptEnvLoaded() {
  if (didLoadEnvFiles) {
    return;
  }

  loadEnvFile(resolve(PROJECT_ROOT, ".env"));
  loadEnvFile(resolve(PROJECT_ROOT, ".env.local"));
  didLoadEnvFiles = true;
}

function normalizeMultilineEnv(value) {
  return value.replace(/\\n/g, "\n").trim();
}

function isLocalDevelopmentTarget() {
  const target =
    process.env.CONVEX_URL ||
    process.env.CONVEX_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL ||
    "";

  return target.includes("127.0.0.1") || target.includes("localhost");
}

export function getConvexUrl() {
  ensureScriptEnvLoaded();

  const url =
    process.env.CONVEX_URL ||
    process.env.CONVEX_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    "http://127.0.0.1:3210";

  if (!url) {
    throw new Error("Convex URL is not configured.");
  }

  return url;
}

function getAlgorithm() {
  ensureScriptEnvLoaded();
  return process.env.CONVEX_AUTH_ALGORITHM === "ES256"
    ? "ES256"
    : DEFAULT_CONVEX_AUTH_ALGORITHM;
}

function getIssuer() {
  ensureScriptEnvLoaded();
  return process.env.CONVEX_AUTH_ISSUER || DEFAULT_CONVEX_AUTH_ISSUER;
}

function getAudience() {
  ensureScriptEnvLoaded();
  return process.env.CONVEX_AUTH_AUDIENCE || DEFAULT_CONVEX_AUTH_AUDIENCE;
}

function decodeJwksJson() {
  ensureScriptEnvLoaded();

  const rawJwks = process.env.CONVEX_AUTH_JWKS ||
    (isLocalDevelopmentTarget() ? DEV_FALLBACK_JWKS : undefined);
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
  const jwks = JSON.parse(decodeJwksJson());
  const keyId = jwks.keys?.[0]?.kid;

  if (!keyId) {
    throw new Error("CONVEX_AUTH_JWKS must include a key id (kid).");
  }

  return keyId;
}

async function getPrivateKey() {
  if (!privateKeyPromise) {
    ensureScriptEnvLoaded();

    const privateKeyPem = process.env.CONVEX_AUTH_PRIVATE_KEY ||
      (isLocalDevelopmentTarget() ? DEV_FALLBACK_PRIVATE_KEY : undefined);
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

export async function createConvexServiceToken(service, expiresIn = "12h") {
  return new SignJWT({
    role: "service",
    service,
  })
    .setProtectedHeader({
      alg: getAlgorithm(),
      typ: "JWT",
      kid: getKeyId(),
    })
    .setSubject(`service:${service}`)
    .setIssuer(getIssuer())
    .setAudience(getAudience())
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(await getPrivateKey());
}

export async function getConvexServiceClient(service = "script") {
  return new ConvexHttpClient(getConvexUrl(), {
    auth: await createConvexServiceToken(service),
  });
}