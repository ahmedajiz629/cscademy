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

function getRequiredEnv(name) {
  ensureScriptEnvLoaded();

  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured.`);
  }

  return value;
}

export function getConvexUrl() {
  ensureScriptEnvLoaded();

  const url =
    process.env.CONVEX_URL ||
    process.env.CONVEX_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_CONVEX_URL;

  if (!url?.trim()) {
    throw new Error(
      "One of CONVEX_URL, CONVEX_INTERNAL_URL, or NEXT_PUBLIC_CONVEX_URL must be configured."
    );
  }

  return url.trim();
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
  const rawJwks = getRequiredEnv("CONVEX_AUTH_JWKS");

  if (!rawJwks.startsWith("data:")) {
    return rawJwks;
  }

  const [, encoded = ""] = rawJwks.split(",", 2);
  const isBase64 = rawJwks.includes(";base64,");

  return isBase64
    ? Buffer.from(encoded, "base64").toString("utf8")
    : decodeURIComponent(encoded);
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
    const privateKeyPem = getRequiredEnv("CONVEX_AUTH_PRIVATE_KEY");

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