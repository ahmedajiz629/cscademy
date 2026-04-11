import { createHash } from "node:crypto";
import {
  isSha256Hex,
  type MainProjectUploadFieldKey,
} from "@/lib/main-project";

type CloudinaryResourceType = "image" | "raw" | "video";

type ParsedCloudinaryAssetDescriptor = {
  resourceType: CloudinaryResourceType;
  type: string;
  publicId: string;
  format: string;
};

const CLOUDINARY_DELIVERY_ALIASES: Record<
  string,
  { resourceType: CloudinaryResourceType; type: string }
> = {
  authenticated_images: { resourceType: "image", type: "authenticated" },
  files: { resourceType: "raw", type: "upload" },
  images: { resourceType: "image", type: "upload" },
  private_images: { resourceType: "image", type: "private" },
  videos: { resourceType: "video", type: "upload" },
};

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

function splitCloudinaryPublicIdAndFormat(identifier: string) {
  const lastDot = identifier.lastIndexOf(".");

  if (lastDot <= 0 || lastDot === identifier.length - 1) {
    return null;
  }

  return {
    format: identifier.slice(lastDot + 1),
    publicId: identifier.slice(0, lastDot),
  };
}

function parseConfiguredCloudinaryAssetUrl(
  rawValue: string
): ParsedCloudinaryAssetDescriptor | null {
  if (!isConfiguredCloudinaryAssetUrl(rawValue)) {
    return null;
  }

  const url = new URL(rawValue);
  const segments = url.pathname.split("/").filter(Boolean);

  if (segments.length < 4) {
    return null;
  }

  const aliasedDescriptor = CLOUDINARY_DELIVERY_ALIASES[segments[1]];
  let resourceType: CloudinaryResourceType;
  let type: string;
  let assetPathStartIndex: number;

  if (aliasedDescriptor) {
    resourceType = aliasedDescriptor.resourceType;
    type = aliasedDescriptor.type;
    assetPathStartIndex = 2;
  } else {
    const candidateResourceType = segments[1];

    if (
      candidateResourceType !== "image" &&
      candidateResourceType !== "raw" &&
      candidateResourceType !== "video"
    ) {
      return null;
    }

    if (segments.length < 5) {
      return null;
    }

    resourceType = candidateResourceType;
    type = segments[2];
    assetPathStartIndex = 3;
  }

  const versionIndex = segments.findIndex(
    (segment, index) => index >= assetPathStartIndex && /^v\d+$/.test(segment)
  );
  const publicIdSegments =
    versionIndex === -1
      ? segments.slice(assetPathStartIndex)
      : segments.slice(versionIndex + 1);

  if (!publicIdSegments.length) {
    return null;
  }

  const publicIdentifier = publicIdSegments
    .map((segment) => decodeURIComponent(segment))
    .join("/");
  const publicIdAndFormat = splitCloudinaryPublicIdAndFormat(publicIdentifier);

  if (!publicIdAndFormat) {
    return null;
  }

  return {
    format: publicIdAndFormat.format,
    publicId: publicIdAndFormat.publicId,
    resourceType,
    type,
  };
}

function buildSignedCloudinaryDownloadUrl(
  asset: ParsedCloudinaryAssetDescriptor
) {
  const { apiKey, apiSecret, cloudName } = getCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    format: asset.format,
    public_id: asset.publicId,
    timestamp,
    type: asset.type,
  };
  const query = new URLSearchParams({
    api_key: apiKey,
    format: asset.format,
    public_id: asset.publicId,
    signature: signCloudinaryParams(params, apiSecret),
    timestamp: String(timestamp),
  });

  if (asset.type) {
    query.set("type", asset.type);
  }

  return `https://api.cloudinary.com/v1_1/${cloudName}/${asset.resourceType}/download?${query.toString()}`;
}

async function computeResponseSha256(response: Response) {
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

export async function computeRemoteSha256(
  url: string,
  signedDownloadUrl?: string
) {
  const response = await fetch(url, { cache: "no-store" });

  if (response.ok) {
    return computeResponseSha256(response);
  }

  if (
    signedDownloadUrl &&
    (response.status === 401 || response.status === 403)
  ) {
    const signedResponse = await fetch(signedDownloadUrl, { cache: "no-store" });

    if (signedResponse.ok) {
      return computeResponseSha256(signedResponse);
    }

    throw new Error(`Failed to fetch uploaded file (${signedResponse.status}).`);
  }

  throw new Error(`Failed to fetch uploaded file (${response.status}).`);
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

  const cloudinaryAsset = parseConfiguredCloudinaryAssetUrl(url.toString());
  const signedDownloadUrl = cloudinaryAsset
    ? buildSignedCloudinaryDownloadUrl(cloudinaryAsset)
    : undefined;
  const actualSha256 = await computeRemoteSha256(
    url.toString(),
    signedDownloadUrl
  );

  if (actualSha256 !== normalizedExpectedHash) {
    throw new Error("Uploaded file hash verification failed.");
  }

  return {
    sha256: actualSha256,
    url: url.toString(),
  };
}