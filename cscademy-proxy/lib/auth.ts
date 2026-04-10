/**
 * Auth utilities — JWT creation/verification + password hashing.
 * Uses `jose` (edge-compatible) for JWT and `bcryptjs` for passwords.
 */
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";

const SALT_ROUNDS = 10;

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET not set in environment");
  return new TextEncoder().encode(secret);
}

// ── Password helpers ──────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ── JWT helpers ───────────────────────────────────────────────

export interface AuthPayload {
  userId: string;
  role: "admin" | "student";
  email: string;
}

export async function createToken(payload: AuthPayload): Promise<string> {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<AuthPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as AuthPayload;
  } catch {
    return null;
  }
}

function getProtocolFromUrlLike(rawValue: string | null): string | null {
  if (!rawValue) {
    return null;
  }

  try {
    const protocol = new URL(rawValue).protocol;
    if (protocol === "http:" || protocol === "https:") {
      return protocol;
    }
  } catch {
    return null;
  }

  return null;
}

function getForwardedProtocol(req: NextRequest): string | null {
  const forwarded = req.headers.get("forwarded");
  const forwardedProtoMatch = forwarded?.match(/proto=([^;,"]+|"[^"]+")/i);
  if (forwardedProtoMatch) {
    return forwardedProtoMatch[1].replace(/^"|"$/g, "").toLowerCase();
  }

  return req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase() ?? null;
}

export function isSecureBrowserRequest(req: NextRequest): boolean {
  const originProtocol = getProtocolFromUrlLike(req.headers.get("origin"));
  if (originProtocol) {
    return originProtocol === "https:";
  }

  const refererProtocol = getProtocolFromUrlLike(req.headers.get("referer"));
  if (refererProtocol) {
    return refererProtocol === "https:";
  }

  const forwardedProtocol = getForwardedProtocol(req);
  if (forwardedProtocol === "https" || forwardedProtocol === "http") {
    return forwardedProtocol === "https";
  }

  return req.nextUrl.protocol === "https:";
}

// ── Request helpers ───────────────────────────────────────────

export async function getAuthUser(
  req: NextRequest
): Promise<AuthPayload | null> {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}
