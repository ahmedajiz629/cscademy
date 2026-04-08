const LEGACY_OFFLINE_ANTI_CHEAT_REASON = "anti_cheat_canary";

export const OFFLINE_ANTI_CHEAT_REASON = "probe_match";
export const OFFLINE_ANTI_CHEAT_RETRY_INTERVAL_MS = 15000;

export function buildOfflineProbeUrl(
  baseUrl: string,
  nonce: string
) {
  const url = new URL(baseUrl);
  url.searchParams.set("v", nonce);
  return url.toString();
}

export function isOfflineIncidentFlag(reason?: string) {
  return (
    reason === OFFLINE_ANTI_CHEAT_REASON ||
    reason === LEGACY_OFFLINE_ANTI_CHEAT_REASON
  );
}

export function formatOfflineClosedReason(reason?: string) {
  if (!reason) {
    return null;
  }

  switch (reason) {
    case "connection_lost":
      return "connection lost";
    default:
      if (isOfflineIncidentFlag(reason)) {
        return "connection lost";
      }
      return reason.replace(/_/g, " ");
  }
}

export function formatOfflineAdminReason(reason?: string) {
  if (!reason) {
    return null;
  }

  switch (reason) {
    case "connection_lost":
      return "Connection lost";
    default:
      if (isOfflineIncidentFlag(reason)) {
        return "Anti-cheat detected";
      }
      return reason.replace(/_/g, " ");
  }
}