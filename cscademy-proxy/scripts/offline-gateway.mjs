import { ConvexHttpClient } from "convex/browser";
import { jwtVerify } from "jose";
import { WebSocketServer } from "ws";

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
const GATEWAY_SECRET =
  process.env.OFFLINE_GATEWAY_SECRET || process.env.JWT_SECRET;
const HOST = process.env.OFFLINE_GATEWAY_HOST || "0.0.0.0";
const PORT = Number(process.env.OFFLINE_GATEWAY_PORT || 8787);
const ISSUER = "cscademy-proxy";
const AUDIENCE = "offline-gateway";
const HEARTBEAT_INTERVAL_MS = 5000;

if (!CONVEX_URL) {
  throw new Error("NEXT_PUBLIC_CONVEX_URL must be set for the offline gateway.");
}

if (!GATEWAY_SECRET) {
  throw new Error(
    "OFFLINE_GATEWAY_SECRET or JWT_SECRET must be set for the offline gateway."
  );
}

const convex = new ConvexHttpClient(CONVEX_URL);
const secret = new TextEncoder().encode(GATEWAY_SECRET);
const wss = new WebSocketServer({ host: HOST, port: PORT });

console.log(`[offline-gateway] listening on ws://${HOST}:${PORT}`);

wss.on("connection", async (socket, request) => {
  const requestUrl = new URL(
    request.url || "/",
    `ws://${request.headers.host || "localhost"}`
  );
  const token = requestUrl.searchParams.get("token");

  if (!token) {
    socket.close(1008, "Missing token");
    return;
  }

  let payload;
  try {
    const verified = await jwtVerify(token, secret, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    if (verified.payload.kind !== AUDIENCE) {
      throw new Error("Invalid offline gateway token kind.");
    }

    payload = {
      sessionId: String(verified.payload.sessionId),
      userId: String(verified.payload.userId),
      trackSlug: String(verified.payload.trackSlug),
      problemSlug: String(verified.payload.problemSlug),
    };
  } catch (error) {
    console.error("[offline-gateway] token verification failed", error);
    socket.close(1008, "Invalid token");
    return;
  }

  try {
    await convex.mutation("offlineProblemSessions:activate", {
      sessionId: payload.sessionId,
    });
  } catch (error) {
    console.error("[offline-gateway] activation failed", error);
    socket.close(1011, "Activation failed");
    return;
  }

  socket.isAlive = true;
  socket.on("pong", () => {
    socket.isAlive = true;
  });

  const heartbeat = setInterval(async () => {
    if (!socket.isAlive) {
      socket.terminate();
      return;
    }

    socket.isAlive = false;
    try {
      await convex.mutation("offlineProblemSessions:heartbeat", {
        sessionId: payload.sessionId,
      });
      socket.ping();
    } catch (error) {
      console.error("[offline-gateway] heartbeat failed", error);
      socket.terminate();
    }
  }, HEARTBEAT_INTERVAL_MS);

  socket.send(
    JSON.stringify({
      type: "ready",
      userId: payload.userId,
      trackSlug: payload.trackSlug,
      problemSlug: payload.problemSlug,
    })
  );

  socket.on("close", () => {
    clearInterval(heartbeat);
    void convex
      .mutation("offlineProblemSessions:terminate", {
        sessionId: payload.sessionId,
        reason: "connection_lost",
      })
      .catch((error) => {
        console.error("[offline-gateway] termination failed", error);
      });
  });

  socket.on("error", (error) => {
    console.error("[offline-gateway] socket error", error);
  });
});