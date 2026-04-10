import { jwtVerify } from "jose";
import { WebSocketServer } from "ws";
import {
  ensureScriptEnvLoaded,
  getConvexServiceClient,
  setScriptEnvFiles,
} from "./lib/convex-service-client.mjs";

setScriptEnvFiles([".env.gateway", ".env.gateway.local"]);
ensureScriptEnvLoaded();

const ISSUER = "ajiz-tech-challenge";
const AUDIENCE = "offline-gateway";
const HEARTBEAT_INTERVAL_MS = 5000;

function getRequiredEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} must be configured for the offline gateway.`);
  }

  return value;
}

function getRequiredPort() {
  const rawValue = getRequiredEnv("OFFLINE_GATEWAY_PORT");
  const port = Number(rawValue);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("OFFLINE_GATEWAY_PORT must be a positive integer.");
  }

  return port;
}

const GATEWAY_SECRET = getRequiredEnv("OFFLINE_GATEWAY_SECRET");
const HOST = getRequiredEnv("OFFLINE_GATEWAY_HOST");
const PORT = getRequiredPort();

const convex = await getConvexServiceClient("offline-gateway");
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