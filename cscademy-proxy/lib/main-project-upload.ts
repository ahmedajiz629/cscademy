import { createHash } from "node:crypto";
import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isSha256Hex } from "@/lib/main-project";

const REMOTE_FETCH_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_REDIRECTS = 5;

type VerifiedLinkedMainProjectUpload = {
  body?: Buffer;
  contentType: string | null;
  fileSize: number;
  sha256: string;
  url: string;
};

type VerifyLinkedMainProjectUploadOptions = {
  expectedFileSize?: number | null;
  includeBody?: boolean;
};

function buildTamperedFileError() {
  return new Error("The linked file URL appears to have been tampered with.");
}

function normalizeLinkedUploadUrl(rawUrl: string) {
  const trimmed = rawUrl.trim();

  if (!trimmed) {
    throw new Error("A file URL is required.");
  }

  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("The file URL is invalid.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The file URL must use HTTP or HTTPS.");
  }

  if (url.username || url.password) {
    throw new Error("The file URL must not include credentials.");
  }

  url.hash = "";

  return url;
}

function isPrivateIpv4Address(ip: string) {
  const octets = ip.split(".").map((segment) => Number(segment));

  if (octets.length !== 4 || octets.some((segment) => !Number.isInteger(segment))) {
    return false;
  }

  const [first, second] = octets;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function isPrivateIpv6Address(ip: string) {
  const normalized = ip.toLowerCase().split("%")[0];

  if (normalized === "::" || normalized === "::1") {
    return true;
  }

  if (normalized.startsWith("::ffff:")) {
    return isPrivateIpv4Address(normalized.slice("::ffff:".length));
  }

  return (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
}

function isPrivateIpAddress(ip: string) {
  return isPrivateIpv4Address(ip) || isPrivateIpv6Address(ip);
}

function isDisallowedHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();

  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".localdomain") ||
    normalized.endsWith(".internal")
  );
}

async function assertPublicHttpUrl(url: URL) {
  if (!url.hostname) {
    throw new Error("The file URL is invalid.");
  }

  if (isDisallowedHostname(url.hostname)) {
    throw new Error("The file URL must not point to a local or private host.");
  }

  if (isIP(url.hostname)) {
    if (isPrivateIpAddress(url.hostname)) {
      throw new Error("The file URL must not point to a local or private host.");
    }

    return;
  }

  let resolvedAddresses: LookupAddress[];

  try {
    resolvedAddresses = await lookup(url.hostname, {
      all: true,
      verbatim: true,
    });
  } catch {
    throw new Error("Could not resolve the file URL host.");
  }

  if (!resolvedAddresses.length) {
    throw new Error("Could not resolve the file URL host.");
  }

  if (resolvedAddresses.some((entry) => isPrivateIpAddress(entry.address))) {
    throw new Error("The file URL must not point to a local or private host.");
  }
}

async function fetchResolvedResponse(initialUrl: URL) {
  let currentUrl = new URL(initialUrl.toString());

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicHttpUrl(currentUrl);

    let response: Response;

    try {
      response = await fetch(currentUrl.toString(), {
        cache: "no-store",
        headers: {
          "accept-encoding": "identity",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(REMOTE_FETCH_TIMEOUT_MS),
      });
    } catch {
      throw new Error("Failed to fetch the linked file.");
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");

      if (!location) {
        throw new Error("The file URL redirected without a Location header.");
      }

      currentUrl = new URL(location, currentUrl);
      currentUrl.hash = "";
      continue;
    }

    return {
      response,
      url: currentUrl.toString(),
    };
  }

  throw new Error("The file URL redirected too many times.");
}

async function readVerifiedResponse(
  response: Response,
  finalUrl: string,
  options: VerifyLinkedMainProjectUploadOptions
): Promise<VerifiedLinkedMainProjectUpload> {
  if (!response.ok) {
    throw new Error(`Failed to fetch linked file (${response.status}).`);
  }

  if (!response.body) {
    throw new Error("The linked file response did not include a readable body.");
  }

  const hash = createHash("sha256");
  const reader = response.body.getReader();
  const bodyChunks: Buffer[] = [];
  let fileSize = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    fileSize += value.byteLength;
    hash.update(value);

    if (options.includeBody) {
      bodyChunks.push(Buffer.from(value));
    }
  }

  if (
    options.expectedFileSize !== undefined &&
    options.expectedFileSize !== null &&
    fileSize !== options.expectedFileSize
  ) {
    throw buildTamperedFileError();
  }

  return {
    body: options.includeBody ? Buffer.concat(bodyChunks) : undefined,
    contentType: response.headers.get("content-type"),
    fileSize,
    sha256: hash.digest("hex"),
    url: finalUrl,
  };
}

async function verifyLinkedUploadInternal(
  rawUrl: string,
  expectedSha256: string,
  options: VerifyLinkedMainProjectUploadOptions = {}
) {
  const normalizedExpectedHash = expectedSha256.trim().toLowerCase();

  if (!isSha256Hex(normalizedExpectedHash)) {
    throw new Error("Upload hash must be a SHA-256 hex string.");
  }

  const initialUrl = normalizeLinkedUploadUrl(rawUrl);
  const { response, url } = await fetchResolvedResponse(initialUrl);
  const verifiedUpload = await readVerifiedResponse(response, url, options);

  if (verifiedUpload.sha256 !== normalizedExpectedHash) {
    throw buildTamperedFileError();
  }

  return verifiedUpload;
}

export async function verifyLinkedMainProjectUpload(
  rawUrl: string,
  expectedSha256: string,
  options: Omit<VerifyLinkedMainProjectUploadOptions, "includeBody"> = {}
) {
  const verifiedUpload = await verifyLinkedUploadInternal(rawUrl, expectedSha256, options);

  return {
    contentType: verifiedUpload.contentType,
    fileSize: verifiedUpload.fileSize,
    sha256: verifiedUpload.sha256,
    url: verifiedUpload.url,
  };
}

export async function downloadVerifiedMainProjectUpload(
  rawUrl: string,
  expectedSha256: string,
  options: Omit<VerifyLinkedMainProjectUploadOptions, "includeBody"> = {}
) {
  const verifiedUpload = await verifyLinkedUploadInternal(rawUrl, expectedSha256, {
    ...options,
    includeBody: true,
  });

  if (!verifiedUpload.body) {
    throw new Error("The linked file could not be prepared for download.");
  }

  return {
    body: verifiedUpload.body,
    contentType: verifiedUpload.contentType,
    fileSize: verifiedUpload.fileSize,
    sha256: verifiedUpload.sha256,
    url: verifiedUpload.url,
  };
}