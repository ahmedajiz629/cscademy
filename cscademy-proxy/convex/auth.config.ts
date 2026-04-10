import { AuthConfig } from "convex/server";

const CONVEX_AUTH_ALGORITHM = "RS256";
const CONVEX_AUTH_ISSUER = "https://ajiz-tech-challenge.invalid/convex";
const CONVEX_AUTH_AUDIENCE = "ajiz-tech-challenge";

function getRequiredEnv(name: "CONVEX_AUTH_JWKS") {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} must be configured for Convex auth.`);
  }

  return value;
}

function normalizeJwksValue(rawJwks: string) {
  const trimmed = rawJwks.trim();

  if (trimmed.startsWith("data:")) {
    return trimmed;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return typeof parsed === "string" ? parsed : trimmed;
  } catch {
    return trimmed;
  }
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