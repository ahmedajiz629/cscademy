export const OFFLINE_HEARTBEAT_TIMEOUT_MS = 15000;

export function isOfflineSessionStale(
  session:
    | {
        status: "pending" | "active" | "terminated";
        lastHeartbeatAt?: number;
      }
    | null
    | undefined,
  now = Date.now()
) {
  return !!session &&
    session.status === "active" &&
    typeof session.lastHeartbeatAt === "number" &&
    now - session.lastHeartbeatAt > OFFLINE_HEARTBEAT_TIMEOUT_MS;
}