import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { SignJWT, importPKCS8 } from "jose";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const shellEnvKeys = new Set(Object.keys(process.env));
const DEFAULT_ENV_FILES = Object.freeze([".env", ".env.local"]);
const CONVEX_AUTH_ALGORITHM = "RS256";
const CONVEX_AUTH_ISSUER = "https://ajiz-tech-challenge.invalid/convex";
const CONVEX_AUTH_AUDIENCE = "ajiz-tech-challenge";

let configuredEnvFiles = [...DEFAULT_ENV_FILES];
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

export function setScriptEnvFiles(fileNames) {
  if (didLoadEnvFiles) {
    throw new Error("Script env files must be configured before they are loaded.");
  }

  if (!Array.isArray(fileNames) || fileNames.length === 0) {
    throw new Error("Script env files must include at least one file name.");
  }

  configuredEnvFiles = [...fileNames];
}

export function ensureScriptEnvLoaded() {
  if (didLoadEnvFiles) {
    return;
  }

  for (const fileName of configuredEnvFiles) {
    loadEnvFile(resolve(PROJECT_ROOT, fileName));
  }

  didLoadEnvFiles = true;
}

function normalizeMultilineEnv(value) {
  const trimmed = value.trim();
  const unwrapped =
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
      ? trimmed.slice(1, -1)
      : trimmed;

  return unwrapped
    .replace(/\\\r?\n/g, "\n")
    .replace(/\\\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\\r/g, "\r")
    .replace(/\\\\r/g, "\r")
    .replace(/\\r/g, "\r")
    .replace(/\\"/g, '"')
    .trim();
}

function getRequiredEnv(name) {
  ensureScriptEnvLoaded();

  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured.`);
  }

  return value;
}

function normalizeJwksValue(rawJwks) {
  const trimmed = rawJwks.trim();

  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "string" ? parsed : trimmed;
  } catch {
    return trimmed;
  }
}

export function getConvexUrl() {
  return getRequiredEnv("CONVEX_URL");
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
      CONVEX_AUTH_ALGORITHM
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
      alg: CONVEX_AUTH_ALGORITHM,
      typ: "JWT",
      kid: getKeyId(),
    })
    .setSubject(`service:${service}`)
    .setIssuer(CONVEX_AUTH_ISSUER)
    .setAudience(CONVEX_AUTH_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(await getPrivateKey());
}

export async function getConvexServiceClient(service = "script") {
  return new ConvexHttpClient(getConvexUrl(), {
    auth: await createConvexServiceToken(service),
  });
}