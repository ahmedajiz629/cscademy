export const OFFLINE_ANTI_CHEAT_REASON = "anti_cheat_canary";
export const OFFLINE_ANTI_CHEAT_RETRY_INTERVAL_MS = 15000;

export function buildOfflineAntiCheatCanaryUrl(
  baseUrl: string,
  nonce: string
) {
  const url = new URL(baseUrl);
  url.searchParams.set("__canary", nonce);
  return url.toString();
}

export function formatOfflineClosedReason(reason?: string) {
  if (!reason) {
    return null;
  }

  switch (reason) {
    case "connection_lost":
      return "connection lost";
    case OFFLINE_ANTI_CHEAT_REASON:
      return "external internet access detected";
    default:
      return reason.replace(/_/g, " ");
  }
}