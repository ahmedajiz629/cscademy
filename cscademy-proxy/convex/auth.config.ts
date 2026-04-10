import { AuthConfig } from "convex/server";

function getJwks() {
  const rawJwks = process.env.CONVEX_AUTH_JWKS;

  if (!rawJwks) {
    throw new Error("CONVEX_AUTH_JWKS must be configured for Convex auth.");
  }

  if (rawJwks.startsWith("data:")) {
    return rawJwks;
  }

  return `data:application/json;base64,${Buffer.from(rawJwks, "utf8").toString("base64")}`;
}

const algorithm = process.env.CONVEX_AUTH_ALGORITHM === "ES256" ? "ES256" : "RS256";

export default {
  providers: [
    {
      type: "customJwt",
      issuer: process.env.CONVEX_AUTH_ISSUER || "ajiz-tech-challenge-convex",
      applicationID:
        process.env.CONVEX_AUTH_AUDIENCE || "ajiz-tech-challenge",
      jwks: getJwks(),
      algorithm,
    },
  ],
} satisfies AuthConfig;