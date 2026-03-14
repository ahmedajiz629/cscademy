/**
 * CSAcademy Service — handles authentication, WebSocket connection,
 * and code run/submit operations against the CSAcademy API.
 *
 * This is a singleton service that maintains state across API route calls
 * within the same Next.js server process (works in dev mode).
 */
import WebSocket from "ws";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const WS_URL = "wss://ws3.csacademy.com/";

// ── Session state ──────────────────────────────────────────────
interface Session {
  cookies: string; // full cookie header value
  csrfToken: string;
  userId: string;
  sessionId: string;
  workspaceId: string;
}

let session: Session | null = null;
let ws: WebSocket | null = null;
let wsConnected = false;

// Results cache — filled by WebSocket messages
const resultsCache: Record<string, any> = {};

// ── Cookie helpers ─────────────────────────────────────────────

function parseCookiesFromHeaders(headers: Headers): Record<string, string> {
  const cookies: Record<string, string> = {};
  const setCookieHeaders = headers.getSetCookie?.() ?? [];
  for (const h of setCookieHeaders) {
    const parts = h.split(";")[0].split("=");
    if (parts.length >= 2) {
      cookies[parts[0].trim()] = parts.slice(1).join("=").trim();
    }
  }
  return cookies;
}

function cookieString(cookieObj: Record<string, string>): string {
  return Object.entries(cookieObj)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// ── Build base headers ────────────────────────────────────────

function baseHeaders(): Record<string, string> {
  if (!session) throw new Error("Not logged in");
  return {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    cookie: session.cookies,
    origin: "https://csacademy.com",
    "sec-ch-ua":
      '"Not(A:Brand";v="8", "Chromium";v="131", "Google Chrome";v="131"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": USER_AGENT,
    "x-csrftoken": session.csrfToken,
    "x-requested-with": "XMLHttpRequest",
  };
}

// ── Login ──────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<Session> {
  console.log("[CSA] Logging in as", email);

  // Step 1: GET the homepage to obtain initial cookies (csrftoken, crossSessionId)
  const initRes = await fetch("https://csacademy.com/", {
    headers: { "User-Agent": USER_AGENT },
    redirect: "manual",
  });
  const initCookies = parseCookiesFromHeaders(initRes.headers);
  console.log("[CSA] Init cookies:", Object.keys(initCookies));

  const csrfToken = initCookies["csrftoken"] || "";
  let allCookies: Record<string, string> = { ...initCookies };

  // Step 2: POST login
  const loginBody = new URLSearchParams({
    login: email,
    password: password,
  });

  const loginRes = await fetch("https://csacademy.com/accounts/login/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
      "X-CSRFToken": csrfToken,
      "X-Requested-With": "XMLHttpRequest",
      Cookie: cookieString(allCookies),
      Referer: "https://csacademy.com/",
      Origin: "https://csacademy.com",
    },
    body: loginBody.toString(),
    redirect: "manual",
  });

  const loginCookies = parseCookiesFromHeaders(loginRes.headers);
  allCookies = { ...allCookies, ...loginCookies };
  console.log(
    "[CSA] Login status:",
    loginRes.status,
    "| New cookies:",
    Object.keys(loginCookies)
  );

  // Follow redirect if 302
  if (loginRes.status === 302) {
    const location = loginRes.headers.get("location") || "https://csacademy.com/";
    const redirectRes = await fetch(
      location.startsWith("http") ? location : `https://csacademy.com${location}`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Cookie: cookieString(allCookies),
        },
        redirect: "manual",
      }
    );
    const redirectCookies = parseCookiesFromHeaders(redirectRes.headers);
    allCookies = { ...allCookies, ...redirectCookies };
  }

  // Step 3: Get user info via AJAX
  const updatedCsrf = allCookies["csrftoken"] || csrfToken;
  const cookieStr = cookieString(allCookies);

  // Try to get user state / info
  const stateRes = await fetch("https://csacademy.com/", {
    headers: {
      "User-Agent": USER_AGENT,
      Cookie: cookieStr,
      Accept: "text/html",
    },
  });
  const stateBody = await stateRes.text();

  // Extract userId from page HTML or cookies
  let userId = "";
  const userIdMatch = stateBody.match(/"id"\s*:\s*(\d+)/);
  if (userIdMatch) {
    userId = userIdMatch[1];
  }
  console.log("[CSA] User ID:", userId || "(not found, will try API)");

  // If we couldn't find userId from HTML, try the user API
  if (!userId) {
    try {
      const userRes = await fetch("https://csacademy.com/api/user/", {
        headers: {
          "User-Agent": USER_AGENT,
          Cookie: cookieStr,
          "X-CSRFToken": updatedCsrf,
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json",
        },
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        userId = String(
          userData.id || userData.userId || userData.user?.id || ""
        );
        console.log("[CSA] User ID from API:", userId);
      }
    } catch {
      console.log("[CSA] Could not get user info from API");
    }
  }

  // Step 4: Get or create workspace session
  let workspaceId = "";
  let sessionId = "";

  // Try to get workspace via API
  try {
    const wsRes = await fetch("https://csacademy.com/api/workspace/", {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Cookie: cookieStr,
        "X-CSRFToken": updatedCsrf,
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Referer: "https://csacademy.com/contest/archive/task/addition/",
        Origin: "https://csacademy.com",
      },
      body: "",
    });
    if (wsRes.ok) {
      const wsData = await wsRes.json();
      workspaceId = String(wsData.workspaceId || wsData.id || "");
      sessionId = String(wsData.sessionId || wsData.session || "");
      console.log("[CSA] Workspace:", workspaceId, "Session:", sessionId);
    }
  } catch {
    console.log("[CSA] Could not get workspace from API");
  }

  // Generate sessionId if none obtained (CSAcademy accepts random session IDs)
  if (!sessionId) {
    sessionId = String(Math.floor(Math.random() * 1e15));
    console.log("[CSA] Generated sessionId:", sessionId);
  }

  // Try getting workspace from task page
  if (!workspaceId) {
    try {
      const taskRes = await fetch(
        "https://csacademy.com/contest/archive/task/addition/",
        {
          headers: {
            "User-Agent": USER_AGENT,
            Cookie: cookieStr,
            Accept: "text/html",
          },
        }
      );
      const taskBody = await taskRes.text();
      const wsMatch = taskBody.match(/"workspaceId"\s*:\s*(\d+)/);
      if (wsMatch) workspaceId = wsMatch[1];
      const sessMatch = taskBody.match(/"sessionId"\s*:\s*"?(\d+)"?/);
      if (sessMatch) sessionId = sessMatch[1];
      console.log("[CSA] From task page - Workspace:", workspaceId, "Session:", sessionId);
    } catch {
      console.log("[CSA] Could not scrape task page");
    }
  }

  session = {
    cookies: cookieStr,
    csrfToken: updatedCsrf,
    userId,
    sessionId,
    workspaceId,
  };

  // Start WebSocket connection
  connectWebSocket();

  return session;
}

// ── WebSocket ──────────────────────────────────────────────────

function connectWebSocket() {
  if (!session) return;
  if (ws && wsConnected) return;

  console.log("[CSA-WS] Connecting...");

  ws = new WebSocket(WS_URL, {
    headers: {
      "User-Agent": USER_AGENT,
      Origin: "https://csacademy.com",
      Cookie: session.cookies,
    },
  });

  ws.on("open", () => {
    wsConnected = true;
    console.log("[CSA-WS] Connected");

    if (!session || !ws) return;

    // Subscribe to channels
    const channels = [
      "global-events",
      `workspacesession-${session.userId}-${session.sessionId}`,
    ];

    for (const ch of channels) {
      const msg = `s ${ch} ${ch.length + 2}`;
      ws.send(msg);
      console.log("[CSA-WS] Subscribed:", ch);
    }
  });

  ws.on("message", (data: WebSocket.Data) => {
    const message = data.toString();

    if (message.startsWith("m ")) {
      try {
        const jsonStart = message.indexOf("{");
        if (jsonStart === -1) return;
        const parsed = JSON.parse(message.substring(jsonStart));

        // Custom run results
        if (parsed.objectType === "customrun" && parsed.objectId) {
          const objId = parsed.objectId;
          if (parsed.type === "runResults") {
            console.log("[CSA-WS] Run results for:", objId);
            resultsCache[objId] = parsed.data;
          } else if (
            parsed.type === "compile_status" &&
            !parsed.data?.compileOK
          ) {
            console.log("[CSA-WS] Compile error for:", objId);
            resultsCache[objId] = {
              error: parsed.data?.compilerMessage || "Compilation failed",
            };
          }
        }

        // Eval job results (submission)
        if (parsed.objectType === "evaljob" && parsed.objectId) {
          const objId = parsed.objectId;

          if (!resultsCache[objId]) {
            resultsCache[objId] = { tests: [], status: "pending" };
          }

          if (parsed.type === "test_results") {
            const tests = parsed.data?.tests || {};
            for (const [, tdata] of Object.entries(tests)) {
              resultsCache[objId].tests.push(tdata);
            }
          } else if (
            parsed.type === "finished" ||
            parsed.type === "done"
          ) {
            resultsCache[objId].status = "done";
            if (parsed.data) {
              Object.assign(resultsCache[objId], parsed.data);
            }
            console.log("[CSA-WS] Job finished:", objId);
          }
        }
      } catch (e) {
        console.error("[CSA-WS] Parse error:", e);
      }
    }
  });

  ws.on("close", () => {
    wsConnected = false;
    console.log("[CSA-WS] Disconnected, reconnecting in 2s...");
    setTimeout(() => connectWebSocket(), 2000);
  });

  ws.on("error", (err: Error) => {
    console.error("[CSA-WS] Error:", err.message);
  });
}

// ── Run code ───────────────────────────────────────────────────

export async function runCode(
  contestTaskId: number,
  sourceCode: string,
  customInput: string,
  referer: string,
  programmingLanguageId: string = "1"
): Promise<any> {
  if (!session) throw new Error("Not logged in");

  const formBody = new URLSearchParams({
    workspaceId: session.workspaceId,
    sessionId: session.sessionId,
    sourceCode,
    programmingLanguageId,
    customInput,
    contestTaskId: String(contestTaskId),
  });

  const headers = {
    ...baseHeaders(),
    referer,
    "content-type": "application/x-www-form-urlencoded",
  };

  const res = await fetch("https://csacademy.com/eval/submit_custom_run/", {
    method: "POST",
    headers,
    body: formBody.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Run submit failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const customRunId = data.customRunId;
  console.log("[CSA] Run submitted:", customRunId);

  // Poll for result via WebSocket cache
  const result = await pollCache(customRunId, 60_000);
  return result;
}

// ── Submit solution ────────────────────────────────────────────

export async function submitCode(
  contestTaskId: number,
  sourceCode: string,
  referer: string,
  programmingLanguageId: string = "1"
): Promise<any> {
  if (!session) throw new Error("Not logged in");

  const formBody = new URLSearchParams({
    workspaceId: session.workspaceId,
    sessionId: session.sessionId,
    contestTaskId: String(contestTaskId),
    sourceCode,
    programmingLanguageId,
  });

  const headers = {
    ...baseHeaders(),
    referer,
    "content-type": "application/x-www-form-urlencoded",
  };

  const res = await fetch("https://csacademy.com/eval/submit_evaljob/", {
    method: "POST",
    headers,
    body: formBody.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Submit failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const evalJobId = data.evalJobId;
  console.log("[CSA] Eval job submitted:", evalJobId);

  // Poll for result via WebSocket cache (longer timeout for submissions)
  const result = await pollCache(evalJobId, 120_000);

  // Convert score from 0.0-1.0 to 0-100
  if (result && result.score !== undefined && result.score !== null) {
    result.score = result.score * 100;
  } else if (result && result.tests) {
    const tests = result.tests as any[];
    if (tests.length > 0) {
      const totalScore = tests.reduce(
        (sum: number, t: any) => sum + (t.checkerScore || 0),
        0
      );
      result.score = (totalScore / tests.length) * 100;
    }
  }

  return result;
}

// ── Poll cache ─────────────────────────────────────────────────

function pollCache(id: string, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      if (id in resultsCache) {
        const data = resultsCache[id];

        // For eval jobs, wait until done
        if (data.status === "pending") return;
        if (data.status === "done" || !data.status) {
          clearInterval(interval);
          delete resultsCache[id];
          resolve(data);
        }
      }

      if (Date.now() - startTime > timeoutMs) {
        clearInterval(interval);
        reject(new Error("Timeout waiting for results"));
      }
    }, 500);
  });
}

// ── Session state accessors ────────────────────────────────────

export function getSession(): Session | null {
  return session;
}

export function isLoggedIn(): boolean {
  return session !== null;
}

export function isWebSocketConnected(): boolean {
  return wsConnected;
}
