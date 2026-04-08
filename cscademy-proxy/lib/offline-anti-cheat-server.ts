import "server-only";

export function getOfflineProbeImageUrl() {
  const rawValue = process.env.OFFLINE_ANTI_CHEAT_CANARY_IMAGE_URL?.trim();

  if (!rawValue) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error(
      "OFFLINE_ANTI_CHEAT_CANARY_IMAGE_URL must be a valid http or https URL."
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      "OFFLINE_ANTI_CHEAT_CANARY_IMAGE_URL must use http or https."
    );
  }

  return url.toString();
}