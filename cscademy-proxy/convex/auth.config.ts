import { AuthConfig } from "convex/server";

const CONVEX_AUTH_ALGORITHM = "RS256";
const CONVEX_AUTH_ISSUER = "https://ajiz-tech-challenge.invalid/convex";
const CONVEX_AUTH_AUDIENCE = "ajiz-tech-challenge";

function unwrapQuotedEnv(value: string) {
  const trimmed = value.trim();

  return (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ? trimmed.slice(1, -1)
    : trimmed;
}

function getRequiredEnv(name: "CONVEX_AUTH_JWKS") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} must be configured for Convex auth.`);
  }

  return value;
}

function normalizeJwksValue(rawJwks: string) {
  const unwrapped = unwrapQuotedEnv(rawJwks);

  if (unwrapped.startsWith("data:")) {
    return unwrapped;
  }

  const candidates = [unwrapped, unwrapped.replace(/\\"/g, '"')];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
    } catch {
      continue;
    }
  }

  return candidates[candidates.length - 1];
}

function getJwks() {
  const rawJwks = normalizeJwksValue(getRequiredEnv("CONVEX_AUTH_JWKS"));

  if (rawJwks.startsWith("data:")) {
    return rawJwks;
  }

  return `data:application/json,${encodeURIComponent(rawJwks)}`;
}

export default {
  providers: [
    {
      type: "customJwt",
      issuer: CONVEX_AUTH_ISSUER,
      applicationID: CONVEX_AUTH_AUDIENCE,
      jwks: getJwks(),
      algorithm: CONVEX_AUTH_ALGORITHM,
    },
  ],
} satisfies AuthConfig;