import { createHash } from "node:crypto";
import {
  isSha256Hex,
  type MainProjectUploadFieldKey,
} from "@/lib/main-project";

type CloudinaryResourceType = "image" | "raw" | "video";

type ParsedCloudinaryAssetDescriptor = {
  deliveryPublicId: string;
  resourceType: CloudinaryResourceType;
  type: string;
  publicId: string;
  format: string;
  version: string | null;
};

type CloudinaryFetchAttemptLabel =
  | "direct"
  | "signed-delivery"
  | "api-download";

type CloudinaryFailedFetchAttempt = {
  bodyPreview?: string | null;
  error?: string;
  label: CloudinaryFetchAttemptLabel;
  status?: number;
  xCldError?: string | null;
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

const CLOUDINARY_RESTRICTED_DELIVERY_FORMATS = new Set([
  "7z",
  "bz2",
  "gz",
  "pdf",
  "rar",
  "tar",
  "tgz",
  "xz",
  "zip",
]);

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

function buildSignedCloudinaryDeliverySignature(
  signaturePayload: string,
  apiSecret: string
) {
  return createHash("sha1")
    .update(`${signaturePayload}${apiSecret}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
    .slice(0, 8);
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
    deliveryPublicId: publicIdentifier,
    format: publicIdAndFormat.format,
    publicId:
      resourceType === "raw" ? publicIdentifier : publicIdAndFormat.publicId,
    resourceType,
    type,
    version: versionIndex === -1 ? null : segments[versionIndex],
  };
}

function buildSignedCloudinaryDeliveryUrl(
  asset: ParsedCloudinaryAssetDescriptor
) {
  if (!asset.version) {
    return null;
  }

  const { apiSecret, cloudName } = getCloudinaryConfig();
  const signature = buildSignedCloudinaryDeliverySignature(
    `${asset.version}/${asset.deliveryPublicId}`,
    apiSecret
  );

  return `https://res.cloudinary.com/${cloudName}/${asset.resourceType}/${asset.type}/s--${signature}--/${asset.version}/${asset.deliveryPublicId}`;
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

function summarizeCloudinaryResponseText(rawValue: string) {
  const normalized = rawValue.replace(/\s+/g, " ").trim();

  return normalized ? normalized.slice(0, 200) : null;
}

async function inspectCloudinaryFetchFailure(
  label: CloudinaryFetchAttemptLabel,
  response: Response
): Promise<CloudinaryFailedFetchAttempt> {
  let bodyPreview: string | null = null;

  try {
    bodyPreview = summarizeCloudinaryResponseText(await response.text());
  } catch {
    bodyPreview = null;
  }

  return {
    bodyPreview,
    label,
    status: response.status,
    xCldError: response.headers.get("x-cld-error"),
  };
}

function formatCloudinaryFetchAttempt(attempt: CloudinaryFailedFetchAttempt) {
  const parts = [attempt.label];

  if (attempt.status !== undefined) {
    parts.push(String(attempt.status));
  } else {
    parts.push("error");
  }

  const detail = attempt.xCldError || attempt.error || attempt.bodyPreview;

  if (detail) {
    parts.push(`(${detail})`);
  }

  return parts.join(" ");
}

function isCloudinaryRestrictedDeliveryFailure(
  asset: ParsedCloudinaryAssetDescriptor | null,
  attempts: CloudinaryFailedFetchAttempt[]
) {
  if (!asset) {
    return false;
  }

  if (!CLOUDINARY_RESTRICTED_DELIVERY_FORMATS.has(asset.format.toLowerCase())) {
    return false;
  }

  return attempts.some((attempt) => {
    const details = [attempt.xCldError, attempt.bodyPreview, attempt.error]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return (
      attempt.status === 401 ||
      attempt.status === 403 ||
      details.includes("deny or acl") ||
      details.includes("customer is marked as untrusted") ||
      details.includes("show_original_customer_untrusted") ||
      details.includes("blocked for delivery")
    );
  });
}

function buildCloudinaryFetchVerificationError(
  asset: ParsedCloudinaryAssetDescriptor | null,
  attempts: CloudinaryFailedFetchAttempt[]
) {
  const attemptSummary = attempts.map(formatCloudinaryFetchAttempt).join("; ");
  const restrictedDelivery = isCloudinaryRestrictedDeliveryFailure(asset, attempts);
  const error = new Error(
    restrictedDelivery
      ? `Cloudinary blocked delivery of the uploaded ${asset?.format.toUpperCase() ?? "file"} while verifying the submission. Enable \"Allow delivery of PDF and ZIP files\" in Cloudinary Product Environment -> Security, wait for any cached 40x responses to clear if needed, and retry the submission. Attempts: ${attemptSummary}`
      : `Failed to fetch uploaded file from Cloudinary. Attempts: ${attemptSummary}`
  ) as Error & {
    details?: {
      asset: ParsedCloudinaryAssetDescriptor | null;
      attempts: CloudinaryFailedFetchAttempt[];
    };
  };

  error.name = "CloudinaryUploadVerificationError";
  error.details = {
    asset,
    attempts,
  };

  return error;
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
  fallbackUrls: Array<{
    label: CloudinaryFetchAttemptLabel;
    url: string;
  }> = [],
  cloudinaryAsset: ParsedCloudinaryAssetDescriptor | null = null
) {
  const attempts: CloudinaryFailedFetchAttempt[] = [];

  const tryFetch = async (
    targetUrl: string,
    label: CloudinaryFetchAttemptLabel
  ) => {
    try {
      const response = await fetch(targetUrl, { cache: "no-store" });

      if (response.ok) {
        return await computeResponseSha256(response);
      }

      attempts.push(await inspectCloudinaryFetchFailure(label, response));
      return null;
    } catch (error) {
      attempts.push({
        error: error instanceof Error ? error.message : String(error),
        label,
      });
      return null;
    }
  };

  const directSha256 = await tryFetch(url, "direct");

  if (directSha256) {
    return directSha256;
  }

  for (const fallback of fallbackUrls) {
    const fallbackSha256 = await tryFetch(fallback.url, fallback.label);

    if (fallbackSha256) {
      return fallbackSha256;
    }
  }

  console.warn("[main-project-upload] Cloudinary verification fetch failed", {
    asset: cloudinaryAsset,
    attempts,
  });

  throw buildCloudinaryFetchVerificationError(cloudinaryAsset, attempts);
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
  const fallbackUrls = [] as Array<{
    label: CloudinaryFetchAttemptLabel;
    url: string;
  }>;

  if (cloudinaryAsset) {
    const signedDeliveryUrl = buildSignedCloudinaryDeliveryUrl(cloudinaryAsset);

    if (signedDeliveryUrl) {
      fallbackUrls.push({
        label: "signed-delivery",
        url: signedDeliveryUrl,
      });
    }

    fallbackUrls.push({
      label: "api-download",
      url: buildSignedCloudinaryDownloadUrl(cloudinaryAsset),
    });
  }

  const actualSha256 = await computeRemoteSha256(
    url.toString(),
    fallbackUrls,
    cloudinaryAsset
  );

  if (actualSha256 !== normalizedExpectedHash) {
    throw new Error("Uploaded file hash verification failed.");
  }

  return {
    sha256: actualSha256,
    url: url.toString(),
  };
}