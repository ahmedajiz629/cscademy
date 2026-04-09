/**
 * CSAcademy Service — handles authentication, WebSocket connection,
 * and code run/submit operations against the CSAcademy API.
 *
 * Fully automatic: provide CSACADEMY_EMAIL + CSACADEMY_PASSWORD in .env.local.
 * Includes retry logic with exponential backoff to handle flaky connectivity.
 */
import WebSocket from "ws";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const WS_URL = "wss://ws3.csacademy.com/";
const FETCH_TIMEOUT = 60_000; // 60s per attempt
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 2_000; // 2s, doubles each retry

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
let loginInProgress: Promise<Session> | null = null;

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

/** fetch with AbortController timeout + automatic retries */
async function fetchRetry(
  url: string,
  init: RequestInit = {},
  {
    timeoutMs = FETCH_TIMEOUT,
    retries = MAX_RETRIES,
    retryDelay = INITIAL_RETRY_DELAY,
    label = "",
  } = {}
): Promise<Response> {
  let lastError: Error | null = null;
  const tag = label || url;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const t0 = Date.now();
    if (attempt === 0) {
      console.log(`[CSA] >> ${tag} ...`);
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        const elapsed = Date.now() - t0;
        console.log(`[CSA] << ${tag} ${res.status} (${elapsed}ms)`);
        return res;
      } finally {
        clearTimeout(timer);
      }
    } catch (err: any) {
      lastError = err;
      const code = err.cause?.code || err.name || "UNKNOWN";
      const elapsed = Date.now() - t0;
      const isRetryable =
        err.name === "AbortError" ||
        code === "UND_ERR_CONNECT_TIMEOUT" ||
        code === "ECONNREFUSED" ||
        code === "ENOTFOUND" ||
        code === "ECONNRESET" ||
        code === "UND_ERR_SOCKET";

      if (!isRetryable || attempt >= retries) {
        console.error(`[CSA] !! ${tag} FAILED after ${attempt + 1} attempt(s) (${code}, ${elapsed}ms)`);
        throw err;
      }

      const delay = retryDelay * Math.pow(2, attempt);
      console.log(
        `[CSA] !! ${tag} failed (${code}, ${elapsed}ms) — ` +
          `retry ${attempt + 1}/${retries} in ${delay / 1000}s...`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError || new Error("fetchRetry exhausted");
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

// ── Ensure session (auto-login, deduplicated) ─────────────────

export async function ensureSession(): Promise<Session> {
  if (session) {
    console.log(`[CSA] Session already active (user=${session.userId}, ws=${wsConnected ? "connected" : "disconnected"})`);
    return session;
  }

  // Deduplicate concurrent login attempts
  if (loginInProgress) {
    console.log("[CSA] Login already in progress, waiting...");
    return loginInProgress;
  }

  const email = process.env.CSACADEMY_EMAIL;
  const password = process.env.CSACADEMY_PASSWORD;
  if (!email || !password) {
    console.error("[CSA] Missing CSACADEMY_EMAIL or CSACADEMY_PASSWORD in env");
    throw new Error(
      "CSACADEMY_EMAIL and CSACADEMY_PASSWORD must be set in .env.local"
    );
  }

  console.log("[CSA] No active session, starting login...");
  loginInProgress = login(email, password).finally(() => {
    loginInProgress = null;
  });
  return loginInProgress;
}

// ── Programmatic login ─────────────────────────────────────────

export async function login(email: string, password: string): Promise<Session> {
  const loginStart = Date.now();
  console.log("═".repeat(60));
  console.log("[CSA] LOGIN START — Logging in as", email);
  console.log("═".repeat(60));

  // Step 1: GET the homepage to obtain initial cookies (csrftoken, crossSessionId)
  const initRes = await fetchRetry(
    "https://csacademy.com/",
    {
      headers: { "User-Agent": USER_AGENT },
      redirect: "manual",
    },
    { label: "GET homepage" }
  );
  const initCookies = parseCookiesFromHeaders(initRes.headers);
  console.log("[CSA] Step 1/3 DONE — Got initial cookies:", Object.keys(initCookies).join(", ") || "(none)");
  if (!initCookies["csrftoken"]) {
    console.warn("[CSA] WARNING: No csrftoken in initial cookies! Login may fail.");
  }

  const csrfToken = initCookies["csrftoken"] || "";
  let allCookies: Record<string, string> = { ...initCookies };

  // Step 2: POST login (field is "username", not "login")
  const loginBody = new URLSearchParams({
    username: email,
    password: password,
  });

  const loginRes = await fetchRetry(
    "https://csacademy.com/accounts/login/",
    {
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
    },
    { label: "POST login" }
  );

  const loginCookies = parseCookiesFromHeaders(loginRes.headers);
  allCookies = { ...allCookies, ...loginCookies };

  // Validate login response
  let loginSuccess = false;
  if (loginRes.status === 200) {
    try {
      const loginData = await loginRes.clone().json();
      loginSuccess = loginData.success === true;
      console.log("[CSA] Step 2/3 DONE — Login response:", JSON.stringify(loginData));
    } catch { /* not JSON */ }
  }
  if (loginRes.status === 302) {
    loginSuccess = true; // redirect = success
    console.log("[CSA] Step 2/3 DONE — Login redirect (302)");
  }

  console.log(
    `[CSA]   HTTP ${loginRes.status} | Success: ${loginSuccess}`,
    "| New cookies:",
    Object.keys(loginCookies).join(", ") || "(none)"
  );

  if (!loginSuccess) {
    if (loginRes.status === 500) {
      const errBody = await loginRes.text().catch(() => "");
      console.error("[CSA] ✗ Login returned 500:", errBody.substring(0, 300));
    }
    throw new Error(`Login failed with HTTP ${loginRes.status}`);
  }

  // Follow redirect if 302
  if (loginRes.status === 302) {
    const location = loginRes.headers.get("location") || "https://csacademy.com/";
    const redirectRes = await fetchRetry(
      location.startsWith("http") ? location : `https://csacademy.com${location}`,
      {
        headers: {
          "User-Agent": USER_AGENT,
          Cookie: cookieString(allCookies),
        },
        redirect: "manual",
      },
      { label: "Follow redirect" }
    );
    const redirectCookies = parseCookiesFromHeaders(redirectRes.headers);
    allCookies = { ...allCookies, ...redirectCookies };
  }

  // Step 3: Get user info + workspace from /workspace/list/
  console.log("[CSA] Step 3/3 — Fetching workspace & user info...");
  const updatedCsrf = allCookies["csrftoken"] || csrfToken;
  const cookieStr = cookieString(allCookies);
  console.log("[CSA]   CSRF token:", updatedCsrf ? updatedCsrf.substring(0, 8) + "..." : "(empty!)");
  console.log("[CSA]   Total cookies in jar:", Object.keys(allCookies).length);

  let userId = "";
  let workspaceId = "";
  const sessionId = String(Math.floor(Math.random() * 1e15));

  const loadWorkspace = async () => {
    const wsPageRes = await fetchRetry(
      "https://csacademy.com/workspace/list/",
      {
        headers: {
          "User-Agent": USER_AGENT,
          Cookie: cookieStr,
          "X-CSRFToken": updatedCsrf,
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json, text/javascript, */*; q=0.01",
          Referer: "https://csacademy.com/workspace/",
        },
      },
      { label: "GET workspace list", retries: 2 }
    );
    if (!wsPageRes.ok) {
      throw new Error(`workspace list failed (HTTP ${wsPageRes.status})`);
    }

    const wsPageData = await wsPageRes.json();
    const workspaces = Array.isArray(wsPageData?.state?.Workspace) ? wsPageData.state.Workspace : [];
    console.log(`[CSA]   Found ${workspaces.length} workspace(s)`);
    if (workspaces.length === 0) {
      return { workspaceId: "", userId: "" };
    }

    const workspace = [...workspaces].sort(
      (left, right) => Number(right?.lastModified || 0) - Number(left?.lastModified || 0)
    )[0];

    return {
      workspaceId: String(workspace?.id || ""),
      userId: String(workspace?.userId || ""),
      name: String(workspace?.name || ""),
    };
  };

  const createWorkspace = async () => {
    const createRes = await fetchRetry(
      "https://csacademy.com/workspace/create/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
          Cookie: cookieStr,
          "X-CSRFToken": updatedCsrf,
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json, text/javascript, */*; q=0.01",
          Referer: "https://csacademy.com/workspace/",
          Origin: "https://csacademy.com",
        },
        body: new URLSearchParams({
          name: "Ajiz Tech Challenge",
        }).toString(),
      },
      { label: "POST workspace create", retries: 2 }
    );
    if (!createRes.ok) {
      throw new Error(`workspace create failed (HTTP ${createRes.status})`);
    }

    const createData = await createRes.json();
    if (createData?.error) {
      throw new Error(createData.error.message || JSON.stringify(createData.error));
    }

    return String(createData?.workspaceId || "");
  };

  try {
    const workspace = await loadWorkspace();
    workspaceId = workspace.workspaceId;
    userId = workspace.userId;
    if (workspaceId) {
      console.log(`[CSA]   Using workspace: id=${workspaceId} name="${workspace.name}" userId=${userId}`);
    } else {
      const createdWorkspaceId = await createWorkspace();
      if (createdWorkspaceId) {
        workspaceId = createdWorkspaceId;
        const refreshedWorkspace = await loadWorkspace();
        workspaceId = refreshedWorkspace.workspaceId || workspaceId;
        userId = refreshedWorkspace.userId || userId;
        console.log(`[CSA]   Created workspace: id=${workspaceId} userId=${userId || "(unknown)"}`);
      }
    }
  } catch (e: any) {
    console.error("[CSA] Could not fetch workspace page:", e.message);
  }

  // Fallback: get userId from homepage HTML if not found
  if (!userId) {
    console.log("[CSA]   userId not in workspace data, trying homepage...");
    try {
      const stateRes = await fetchRetry(
        "https://csacademy.com/",
        {
          headers: {
            "User-Agent": USER_AGENT,
            Cookie: cookieStr,
            Accept: "text/html",
          },
        },
        { label: "GET homepage for userId", retries: 2 }
      );
      const stateBody = await stateRes.text();
      const userIdMatch = stateBody.match(/var\s+USER\s*=\s*\{[^}]*"id"\s*:\s*(\d+)/);
      if (userIdMatch) {
        userId = userIdMatch[1];
        console.log("[CSA]   User ID from homepage HTML:", userId);
      }
    } catch {
      console.log("[CSA]   Could not fetch homepage for user ID");
    }
  }

  console.log("[CSA]   Generated sessionId:", sessionId);

  session = {
    cookies: cookieStr,
    csrfToken: updatedCsrf,
    userId,
    sessionId,
    workspaceId,
  };

  const loginElapsed = ((Date.now() - loginStart) / 1000).toFixed(1);
  console.log("═".repeat(60));
  console.log(`[CSA] LOGIN COMPLETE in ${loginElapsed}s`);
  console.log(`[CSA]   User ID:      ${userId || "(unknown)"}`);
  console.log(`[CSA]   Session ID:   ${sessionId}`);
  console.log(`[CSA]   Workspace ID: ${workspaceId || "(unknown)"}`);
  console.log(`[CSA]   CSRF Token:   ${updatedCsrf ? updatedCsrf.substring(0, 12) + "..." : "(empty!)"}`);
  console.log(`[CSA]   Cookies:      ${Object.keys(allCookies).length} entries`);
  console.log("═".repeat(60));

  if (!userId) console.warn("[CSA] WARNING: userId is empty — WebSocket subscriptions may fail");
  if (!workspaceId) console.warn("[CSA] WARNING: workspaceId is empty — run/submit may fail");

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
    console.log("[CSA-WS] ✓ WebSocket CONNECTED to", WS_URL);

    if (!session || !ws) return;

    // Subscribe to channels
    const channels = [
      "global-events",
      `workspacesession-${session.userId}-${session.sessionId}`,
    ];

    for (const ch of channels) {
      const msg = `s ${ch} ${ch.length + 2}`;
      ws.send(msg);
      console.log("[CSA-WS]   Subscribed to channel:", ch);
    }
    console.log("[CSA-WS] Ready to receive results");
  });

  ws.on("message", (data: WebSocket.Data) => {
    const message = data.toString();

    // Log heartbeat-like messages at debug level
    if (!message.startsWith("m ")) {
      if (message.length < 100) {
        console.log("[CSA-WS] msg:", message.substring(0, 80));
      }
      return;
    }

    try {
      const jsonStart = message.indexOf("{");
      if (jsonStart === -1) return;
      const parsed = JSON.parse(message.substring(jsonStart));

      const objType = parsed.objectType || "?";
      const objId = parsed.objectId || "?";
      const msgType = parsed.type || "?";
      console.log(`[CSA-WS] << ${objType}/${msgType} id=${objId}`);

      // Custom run results
      if (parsed.objectType === "customrun" && parsed.objectId) {
        const id = parsed.objectId;
        if (parsed.type === "runResults") {
          const stdout = parsed.data?.stdout || "";
          const stderr = parsed.data?.stderr || "";
          const exitCode = parsed.data?.results?.exitCode ?? "?";
          console.log(`[CSA-WS] ✓ RUN RESULTS id=${id} exit=${exitCode} stdout=${stdout.length}B stderr=${stderr.length}B`);
          resultsCache[id] = parsed.data;
        } else if (parsed.type === "compile_status") {
          if (parsed.data?.compileOK) {
            console.log(`[CSA-WS]   Compile OK for id=${id}`);
          } else {
            console.log(`[CSA-WS] ✗ COMPILE ERROR id=${id}: ${(parsed.data?.compilerMessage || "").substring(0, 200)}`);
            resultsCache[id] = {
              error: parsed.data?.compilerMessage || "Compilation failed",
            };
          }
        }
      }

      // Eval job results (submission)
      if (parsed.objectType === "evaljob" && parsed.objectId) {
        const id = parsed.objectId;

        if (!resultsCache[id]) {
          resultsCache[id] = { tests: [], status: "pending" };
        }

        if (parsed.type === "test_results") {
          const tests = parsed.data?.tests || {};
          const count = Object.keys(tests).length;
          for (const [, tdata] of Object.entries(tests)) {
            resultsCache[id].tests.push(tdata);
          }
          console.log(`[CSA-WS]   +${count} test result(s) for job ${id} (total: ${resultsCache[id].tests.length})`);
        } else if (
          parsed.type === "finished" ||
          parsed.type === "done"
        ) {
          resultsCache[id].status = "done";
          if (parsed.data) {
            Object.assign(resultsCache[id], parsed.data);
          }
          const score = resultsCache[id].score;
          const testCount = resultsCache[id].tests?.length || 0;
          console.log(`[CSA-WS] ✓ JOB FINISHED id=${id} score=${score ?? "?"} tests=${testCount}`);
        }
      }
    } catch (e) {
      console.error("[CSA-WS] Parse error:", e);
      console.error("[CSA-WS]   Raw message:", message.substring(0, 200));
    }
  });

  ws.on("close", (code: number, reason: Buffer) => {
    wsConnected = false;
    console.log(`[CSA-WS] ✗ WebSocket DISCONNECTED (code=${code}, reason=${reason?.toString() || "none"})`);
    console.log("[CSA-WS]   Reconnecting in 2s...");
    setTimeout(() => connectWebSocket(), 2000);
  });

  ws.on("error", (err: Error) => {
    console.error("[CSA-WS] ✗ WebSocket ERROR:", err.message);
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

  console.log("─".repeat(50));
  console.log(`[CSA] RUN CODE — task=${contestTaskId} lang=${programmingLanguageId}`);
  console.log(`[CSA]   code: ${sourceCode.length} chars, input: ${customInput.length} chars`);
  console.log(`[CSA]   session: user=${session.userId} ws=${session.workspaceId} sid=${session.sessionId}`);
  console.log(`[CSA]   WebSocket: ${wsConnected ? "connected" : "DISCONNECTED!"}`);

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

  const res = await fetchRetry(
    "https://csacademy.com/eval/submit_custom_run/",
    {
      method: "POST",
      headers,
      body: formBody.toString(),
    },
    { label: "POST custom_run", retries: 3 }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error(`[CSA] ✗ Run submit failed: ${res.status}`, text.substring(0, 300));
    throw new Error(`Run submit failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const customRunId = data.customRunId;
  console.log(`[CSA] ✓ Run queued — customRunId=${customRunId}, waiting for WebSocket result...`);

  // Poll for result via WebSocket cache
  const result = await pollCache(customRunId, 60_000);
  console.log(`[CSA] ✓ Run result received for ${customRunId}`);
  console.log("─".repeat(50));
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

  console.log("─".repeat(50));
  console.log(`[CSA] SUBMIT CODE — task=${contestTaskId} lang=${programmingLanguageId}`);
  console.log(`[CSA]   code: ${sourceCode.length} chars`);
  console.log(`[CSA]   session: user=${session.userId} ws=${session.workspaceId} sid=${session.sessionId}`);
  console.log(`[CSA]   WebSocket: ${wsConnected ? "connected" : "DISCONNECTED!"}`);

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

  const res = await fetchRetry(
    "https://csacademy.com/eval/submit_evaljob/",
    {
      method: "POST",
      headers,
      body: formBody.toString(),
    },
    { label: "POST evaljob", retries: 3 }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error(`[CSA] ✗ Submit failed: ${res.status}`, text.substring(0, 300));
    throw new Error(`Submit failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const evalJobId = data.evalJobId;
  console.log(`[CSA] ✓ Submission queued — evalJobId=${evalJobId}, waiting for WebSocket result...`);

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

  console.log(`[CSA] ✓ Submit result: score=${result?.score ?? "?"}`);
  console.log("─".repeat(50));
  return result;
}

// ── Poll cache ─────────────────────────────────────────────────

function pollCache(id: string, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let dotCount = 0;
    const interval = setInterval(() => {
      if (id in resultsCache) {
        const data = resultsCache[id];

        // For eval jobs, wait until done
        if (data.status === "pending") {
          dotCount++;
          if (dotCount % 10 === 0) {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
            console.log(`[CSA]   Waiting for ${id}... ${elapsed}s (${resultsCache[id]?.tests?.length || 0} tests so far)`);
          }
          return;
        }
        if (data.status === "done" || !data.status) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`[CSA]   Result ready for ${id} in ${elapsed}s`);
          clearInterval(interval);
          delete resultsCache[id];
          resolve(data);
        }
      }

      if (Date.now() - startTime > timeoutMs) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        console.error(`[CSA] ✗ TIMEOUT after ${elapsed}s waiting for ${id}`);
        console.error(`[CSA]   WebSocket connected: ${wsConnected}`);
        console.error(`[CSA]   Cache keys: [${Object.keys(resultsCache).join(", ")}]`);
        clearInterval(interval);
        reject(new Error(`Timeout waiting for results (${elapsed}s). WebSocket ${wsConnected ? "connected" : "DISCONNECTED"}`));
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
