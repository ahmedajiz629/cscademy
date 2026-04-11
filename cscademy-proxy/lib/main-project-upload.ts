import { createHash } from "node:crypto";
import {
  isSha256Hex,
  type MainProjectUploadFieldKey,
} from "@/lib/main-project";

function getCloudinaryConfig() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET must be configured."
    );
  }

  return { cloudName, apiKey, apiSecret };
}

function sanitizeSegment(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return normalized || "item";
}

function signCloudinaryParams(
  params: Record<string, string | number>,
  apiSecret: string
) {
  const serialized = Object.entries(params)
    .filter(([, value]) => value !== "" && value !== undefined && value !== null)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return createHash("sha1")
    .update(`${serialized}${apiSecret}`)
    .digest("hex");
}

export function buildSignedMainProjectUploadParams({
  problemSlug,
  userId,
  fieldKey,
  fileName,
  sha256,
}: {
  problemSlug: string;
  userId: string;
  fieldKey: MainProjectUploadFieldKey;
  fileName: string;
  sha256: string;
}) {
  if (!isSha256Hex(sha256)) {
    throw new Error("Invalid upload hash.");
  }

  const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = [
    "ajiz-tech-challenge",
    "main-project",
    sanitizeSegment(problemSlug),
    sanitizeSegment(userId),
  ].join("/");
  const publicId = [
    sanitizeSegment(fieldKey),
    sanitizeSegment(fileName.replace(/\.[^.]+$/, "")),
    sha256.slice(0, 16).toLowerCase(),
  ].join("-");
  const context = [
    `fieldKey=${fieldKey}`,
    `problemSlug=${sanitizeSegment(problemSlug)}`,
    `userId=${sanitizeSegment(userId)}`,
    `sha256=${sha256.toLowerCase()}`,
  ].join("|");

  const params = {
    context,
    folder,
    public_id: publicId,
    timestamp,
  };

  return {
    apiKey,
    cloudName,
    context,
    folder,
    publicId,
    signature: signCloudinaryParams(params, apiSecret),
    timestamp,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
  };
}

export function isConfiguredCloudinaryAssetUrl(rawValue: string) {
  const { cloudName } = getCloudinaryConfig();
  const url = new URL(rawValue);

  return (
    url.protocol === "https:" &&
    url.hostname === "res.cloudinary.com" &&
    url.pathname.startsWith(`/${cloudName}/`)
  );
}

export async function computeRemoteSha256(url: string) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to fetch uploaded file (${response.status}).`);
  }

  if (!response.body) {
    throw new Error("Uploaded file response did not include a readable body.");
  }

  const hash = createHash("sha256");
  const reader = response.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    hash.update(value);
  }

  return hash.digest("hex");
}

export async function verifyConfiguredCloudinaryUpload(
  rawUrl: string,
  expectedSha256: string
) {
  const normalizedExpectedHash = expectedSha256.trim().toLowerCase();

  if (!isSha256Hex(normalizedExpectedHash)) {
    throw new Error("Invalid uploaded file hash.");
  }

  let url: URL;

  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("Uploaded file URL is invalid.");
  }

  url.hash = "";

  if (!isConfiguredCloudinaryAssetUrl(url.toString())) {
    throw new Error("Uploaded file must be hosted on the configured Cloudinary account.");
  }

  const actualSha256 = await computeRemoteSha256(url.toString());

  if (actualSha256 !== normalizedExpectedHash) {
    throw new Error("Uploaded file hash verification failed.");
  }

  return {
    sha256: actualSha256,
    url: url.toString(),
  };
}