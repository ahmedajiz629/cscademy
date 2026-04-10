import { AuthConfig } from "convex/server";

const CONVEX_AUTH_ALGORITHM = "RS256";
const CONVEX_AUTH_ISSUER = "https://ajiz-tech-challenge.invalid/convex";
const CONVEX_AUTH_AUDIENCE = "ajiz-tech-challenge";

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

function isLocalDevelopmentTarget() {
  const target =
    process.env.CONVEX_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL ||
    "";

  return target.includes("127.0.0.1") || target.includes("localhost");
}

function getJwks() {
  const rawJwks = process.env.CONVEX_AUTH_JWKS ||
    (isLocalDevelopmentTarget() ? DEV_FALLBACK_JWKS : undefined);

  if (!rawJwks) {
    throw new Error("CONVEX_AUTH_JWKS must be configured for Convex auth.");
  }

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