/**
 * CSAcademy Session Manager — class-based, supports multiple concurrent
 * CSAcademy sessions (one per linked CSAcademy account).
 *
 * Preserves the working login flow:
 *   1. GET https://csacademy.com/  → csrftoken cookie
 *   2. POST /accounts/login/       → username+password (form), success+cookies
 *   3. GET /workspace/list/         → JSON with state.Workspace[{id,userId}]
 *   4. WebSocket wss://ws3.csacademy.com/ → subscribe channels
 */
import WebSocket from "ws";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const WS_URL = "wss://ws3.csacademy.com/";
const FETCH_TIMEOUT = 60_000;
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 2_000;

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

// ── fetchRetry ─────────────────────────────────────────────────

async function fetchRetry(
  url: string,
  init: RequestInit = {},
  opts: {
    timeoutMs?: number;
    retries?: number;
    retryDelay?: number;
    label?: string;
  } = {}
): Promise<Response> {
  const {
    timeoutMs = FETCH_TIMEOUT,
    retries = MAX_RETRIES,
    retryDelay = INITIAL_RETRY_DELAY,
    label = url,
  } = opts;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const t0 = Date.now();
    if (attempt === 0) console.log(`[CSA] >> ${label} ...`);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, { ...init, signal: controller.signal });
        console.log(`[CSA] << ${label} ${res.status} (${Date.now() - t0}ms)`);
        return res;
      } finally {
        clearTimeout(timer);
      }
    } catch (err: any) {
      lastError = err;
      const code = err.cause?.code || err.name || "UNKNOWN";
      const isRetryable =
        err.name === "AbortError" ||
        ["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "ENOTFOUND", "ECONNRESET", "UND_ERR_SOCKET"].includes(code);
      if (!isRetryable || attempt >= retries) {
        console.error(`[CSA] !! ${label} FAILED (${code}, ${Date.now() - t0}ms)`);
        throw err;
      }
      const delay = retryDelay * Math.pow(2, attempt);
      console.log(`[CSA] !! ${label} failed (${code}) — retry ${attempt + 1}/${retries} in ${delay / 1000}s`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError || new Error("fetchRetry exhausted");
}

// ══════════════════════════════════════════════════════════════
// CSAcademySession — one per CSAcademy account
// ══════════════════════════════════════════════════════════════

export class CSAcademySession {
  private email: string;
  private password: string;
  private cookies = "";
  private csrfToken = "";
  userId = "";
  private sessionId: string;
  workspaceId = "";
  private ws: WebSocket | null = null;
  wsConnected = false;
  private wsUserId = "";
  private wsSessionId = "";
  loggedIn = false;
  private loginPromise: Promise<void> | null = null;
  private resultsCache: Record<string, any> = {};

  constructor(email: string, password: string) {
    this.email = email;
    this.password = password;
    this.sessionId = String(Math.floor(Math.random() * 1e15));
  }

  private tag(msg: string) {
    return `[CSA:${this.email.split("@")[0]}] ${msg}`;
  }

  // ── Ensure logged in (deduplicated) ─────────────────────────

  async ensureLoggedIn(): Promise<void> {
    if (this.loggedIn) {
      if (this.workspaceId && this.userId) {
        return;
      }

      console.log(this.tag("Session missing workspace/user, attempting recovery..."));
      try {
        await this.recoverSessionState();
      } catch (error: any) {
        console.error(this.tag("Session recovery failed: " + error.message));
      }

      if (this.workspaceId && this.userId) {
        return;
      }

      console.log(this.tag("Session recovery incomplete, re-authenticating..."));
      this.loggedIn = false;
      this.disconnectWebSocket();
    }

    if (this.loginPromise) return this.loginPromise;
    this.loginPromise = this._login().finally(() => {
      this.loginPromise = null;
    });
    return this.loginPromise;
  }

  // ── Login flow ──────────────────────────────────────────────

  private async _login(): Promise<void> {
    const t0 = Date.now();
    console.log(this.tag("LOGIN START"));

    // Step 1: GET homepage → csrftoken cookie
    const initRes = await fetchRetry(
      "https://csacademy.com/",
      { headers: { "User-Agent": USER_AGENT }, redirect: "manual" },
      { label: this.tag("GET homepage") }
    );
    const initCookies = parseCookiesFromHeaders(initRes.headers);
    const csrfToken = initCookies["csrftoken"] || "";
    let allCookies: Record<string, string> = { ...initCookies };

    // Step 2: POST /accounts/login/ with username+password
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
        body: new URLSearchParams({
          username: this.email,
          password: this.password,
        }).toString(),
        redirect: "manual",
      },
      { label: this.tag("POST login") }
    );
    const loginCookies = parseCookiesFromHeaders(loginRes.headers);
    allCookies = { ...allCookies, ...loginCookies };

    let loginSuccess = false;
    if (loginRes.status === 200) {
      try {
        const data = await loginRes.clone().json();
        loginSuccess = data.success === true;
      } catch { /* not json */ }
    }
    if (loginRes.status === 302) loginSuccess = true;

    if (!loginSuccess) {
      console.error(this.tag(`Login FAILED HTTP ${loginRes.status}`));
      throw new Error(`CSAcademy login failed (HTTP ${loginRes.status})`);
    }

    // Follow redirect if 302
    if (loginRes.status === 302) {
      const loc = loginRes.headers.get("location") || "https://csacademy.com/";
      const rRes = await fetchRetry(
        loc.startsWith("http") ? loc : `https://csacademy.com${loc}`,
        { headers: { "User-Agent": USER_AGENT, Cookie: cookieString(allCookies) }, redirect: "manual" },
        { label: this.tag("Follow redirect") }
      );
      const rCookies = parseCookiesFromHeaders(rRes.headers);
      allCookies = { ...allCookies, ...rCookies };
    }

    // Step 3: GET /workspace/list/ with XHR → JSON {state: {Workspace: [...]}}
    const updatedCsrf = allCookies["csrftoken"] || csrfToken;
    const cookieStr = cookieString(allCookies);

    try {
      await this.refreshWorkspace(cookieStr, updatedCsrf);
      if (!this.workspaceId) {
        const createdWorkspaceId = await this.createWorkspace(cookieStr, updatedCsrf);
        if (createdWorkspaceId) {
          this.workspaceId = createdWorkspaceId;
          await this.refreshWorkspace(cookieStr, updatedCsrf);
        }
      }
    } catch (e: any) {
      console.error(this.tag("Could not fetch workspace: " + e.message));
    }

    // Fallback: get userId from homepage HTML
    if (!this.userId) {
      try {
        await this.refreshUserIdFromHomepage(cookieStr);
      } catch { /* ignore */ }
    }

    this.cookies = cookieStr;
    this.csrfToken = updatedCsrf;
    this.loggedIn = true;

    if (!this.workspaceId) {
      console.error(this.tag("WARNING: workspaceId is empty after login! Submissions will fail."));
    }
    if (!this.userId) {
      console.error(this.tag("WARNING: userId is empty after login! WS channel subscription will be wrong."));
    }

    console.log(this.tag(`LOGIN COMPLETE in ${((Date.now() - t0) / 1000).toFixed(1)}s — user=${this.userId} ws=${this.workspaceId}`));
    await this.connectWebSocket();
    console.log(this.tag("WebSocket ready, session fully initialized"));
  }

  private async recoverSessionState(): Promise<void> {
    if (!this.cookies || !this.csrfToken) {
      throw new Error("Missing session cookies");
    }

    await this.refreshWorkspace(this.cookies, this.csrfToken);
    if (!this.workspaceId) {
      const createdWorkspaceId = await this.createWorkspace(this.cookies, this.csrfToken);
      if (createdWorkspaceId) {
        this.workspaceId = createdWorkspaceId;
        await this.refreshWorkspace(this.cookies, this.csrfToken);
      }
    }

    if (!this.userId) {
      await this.refreshUserIdFromHomepage(this.cookies);
    }
  }

  private async refreshUserIdFromHomepage(cookieStr: string): Promise<void> {
    const homeRes = await fetchRetry(
      "https://csacademy.com/",
      { headers: { "User-Agent": USER_AGENT, Cookie: cookieStr, Accept: "text/html" } },
      { label: this.tag("GET homepage for userId"), retries: 2 }
    );
    const html = await homeRes.text();
    const m = html.match(/var\s+USER\s*=\s*\{[^}]*"id"\s*:\s*(\d+)/);
    if (m) {
      this.userId = m[1];
    }
  }

  private async refreshWorkspace(cookieStr: string, csrfToken: string): Promise<void> {
    const wsRes = await fetchRetry(
      "https://csacademy.com/workspace/list/",
      {
        headers: {
          "User-Agent": USER_AGENT,
          Cookie: cookieStr,
          "X-CSRFToken": csrfToken,
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json, text/javascript, */*; q=0.01",
          Referer: "https://csacademy.com/workspace/",
        },
      },
      { label: this.tag("GET workspace list"), retries: 2 }
    );

    if (!wsRes.ok) {
      throw new Error(`workspace list failed (HTTP ${wsRes.status})`);
    }

    const wsData = await wsRes.json();
    const workspaces = Array.isArray(wsData?.state?.Workspace) ? wsData.state.Workspace : [];
    if (workspaces.length === 0) {
      this.workspaceId = "";
      return;
    }

    const workspace = [...workspaces].sort(
      (left, right) => Number(right?.lastModified || 0) - Number(left?.lastModified || 0)
    )[0];

    this.workspaceId = String(workspace?.id || "");
    if (workspace?.userId) {
      this.userId = String(workspace.userId);
    }
  }

  private async createWorkspace(cookieStr: string, csrfToken: string): Promise<string> {
    const createRes = await fetchRetry(
      "https://csacademy.com/workspace/create/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": USER_AGENT,
          Cookie: cookieStr,
          "X-CSRFToken": csrfToken,
          "X-Requested-With": "XMLHttpRequest",
          Accept: "application/json, text/javascript, */*; q=0.01",
          Referer: "https://csacademy.com/workspace/",
          Origin: "https://csacademy.com",
        },
        body: new URLSearchParams({
          name: "Ajiz Tech Challenge",
        }).toString(),
      },
      { label: this.tag("POST workspace create"), retries: 2 }
    );

    if (!createRes.ok) {
      throw new Error(`workspace create failed (HTTP ${createRes.status})`);
    }

    const createData = await createRes.json();
    if (createData?.error) {
      throw new Error(createData.error.message || JSON.stringify(createData.error));
    }

    return String(createData?.workspaceId || "");
  }

  // ── Build headers ───────────────────────────────────────────

  private baseHeaders(): Record<string, string> {
    return {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      cookie: this.cookies,
      origin: "https://csacademy.com",
      "user-agent": USER_AGENT,
      "x-csrftoken": this.csrfToken,
      "x-requested-with": "XMLHttpRequest",
    };
  }

  // ── WebSocket ───────────────────────────────────────────────

  private connectWebSocket(): Promise<void> {
    if (this.hasCurrentWebSocketSession()) return Promise.resolve();
    if (this.ws) {
      this.disconnectWebSocket();
    }

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error(this.tag("WS connection timeout (15s)"));
        reject(new Error("WebSocket connection timeout"));
      }, 15_000);

      this.ws = new WebSocket(WS_URL, {
        headers: {
          "User-Agent": USER_AGENT,
          Origin: "https://csacademy.com",
          Cookie: this.cookies,
        },
      });

      this.ws.on("open", () => {
        this.wsConnected = true;
        this.wsUserId = this.userId;
        this.wsSessionId = this.sessionId;
        clearTimeout(timeout);
        console.log(this.tag("WS CONNECTED"));
        if (!this.ws) { resolve(); return; }
        const channels = [
          "global-events",
          `workspacesession-${this.userId}-${this.sessionId}`,
        ];
        for (const ch of channels) {
          this.ws.send(`s ${ch} ${ch.length + 2}`);
        }
        resolve();
      });

    this.ws.on("message", (data: WebSocket.Data) => {
      const msg = data.toString();

      // Log non-data messages (heartbeats, subscription confirmations)
      if (!msg.startsWith("m ")) {
        if (msg.length < 200) {
          console.log(this.tag("WS msg: " + msg.substring(0, 100)));
        }
        return;
      }

      try {
        const jsonStart = msg.indexOf("{");
        if (jsonStart === -1) return;
        const parsed = JSON.parse(msg.substring(jsonStart));

        const objType = parsed.objectType || "?";
        const objId = String(parsed.objectId || "?");
        const msgType = parsed.type || "?";
        console.log(this.tag(`WS << ${objType}/${msgType} id=${objId}`));

        // Custom run results
        if (parsed.objectType === "customrun" && parsed.objectId) {
          const id = String(parsed.objectId);
          if (parsed.type === "runResults") {
            console.log(this.tag(`RUN RESULT id=${id}`));
            this.resultsCache[id] = parsed.data;
          } else if (parsed.type === "compile_status") {
            if (parsed.data?.compileOK) {
              console.log(this.tag(`Compile OK id=${id}`));
            } else {
              console.log(this.tag(`COMPILE ERROR id=${id}`));
              this.resultsCache[id] = {
                error: parsed.data?.compilerMessage || "Compilation failed",
              };
            }
          }
        }

        // Eval job results
        if (parsed.objectType === "evaljob" && parsed.objectId) {
          const id = String(parsed.objectId);
          if (!this.resultsCache[id]) {
            this.resultsCache[id] = { tests: [], status: "pending" };
          }
          if (parsed.type === "test_results") {
            const tests = parsed.data?.tests || {};
            const count = Object.keys(tests).length;
            for (const [, tdata] of Object.entries(tests)) {
              // Log the first test object so we can see the exact field names CSAcademy sends
              if (this.resultsCache[id].tests.length === 0) {
                console.log(this.tag(`First test object keys: ${JSON.stringify(Object.keys(tdata as object))}`));
                console.log(this.tag(`First test object: ${JSON.stringify(tdata)}`));
              }
              // Normalize field name variants into what our UI expects
              const t: any = { ...(tdata as object) };
              // Normalize time — try known field names, then scan for any numeric 'time' key
              if (t.time == null) {
                const timeKeys = ['execTime', 'runningTime', 'executionTime', 'cpuTime', 'cpu_time', 'wallTime', 'duration', 'elapsed', 'runtime', 'time_ms', 'timeMs'];
                for (const k of timeKeys) {
                  if (t[k] != null) { t.time = t[k]; break; }
                }
                if (t.time == null) {
                  // Last resort: find any field whose name contains 'time' and holds a number
                  for (const [k, val] of Object.entries(t)) {
                    if (k !== 'time' && k.toLowerCase().includes('time') && typeof val === 'number') {
                      t.time = val; break;
                    }
                  }
                }
              }
              // Normalize memory — try known field names, then scan
              if (t.maxMemory == null) {
                const memKeys = ['memory', 'memUsage', 'memoryUsed', 'mem', 'maxMem', 'peak_memory', 'peakMemory', 'mem_kb', 'memory_kb'];
                for (const k of memKeys) {
                  if (t[k] != null) { t.maxMemory = t[k]; break; }
                }
                if (t.maxMemory == null) {
                  for (const [k, val] of Object.entries(t)) {
                    if (k !== 'maxMemory' && k.toLowerCase().includes('mem') && typeof val === 'number') {
                      t.maxMemory = val; break;
                    }
                  }
                }
              }
              // checkerScore: may appear as score (0-1 range) without checker prefix
              if (t.checkerScore == null && t.score != null) {
                t.checkerScore = t.score;
              }
              this.resultsCache[id].tests.push(t);
            }
            console.log(this.tag(`+${count} test results for job ${id} (total: ${this.resultsCache[id].tests.length})`));
          } else if (parsed.type === "finished" || parsed.type === "done") {
            this.resultsCache[id].status = "done";
            if (parsed.data) Object.assign(this.resultsCache[id], parsed.data);
            console.log(this.tag(`JOB FINISHED id=${id} score=${this.resultsCache[id].score ?? "?"}`));
          }
        }
      } catch (e: any) {
        console.error(this.tag("WS parse error: " + e.message));
        console.error(this.tag("WS raw: " + msg.substring(0, 200)));
      }
    });

      this.ws.on("close", () => {
        this.wsConnected = false;
        this.wsUserId = "";
        this.wsSessionId = "";
        this.ws = null;
        console.log(this.tag("WS disconnected, reconnecting in 2s..."));
        setTimeout(() => this.reconnectWebSocket(), 2000);
      });

      this.ws.on("error", (err: Error) => {
        clearTimeout(timeout);
        console.error(this.tag("WS error: " + err.message));
        reject(err);
      });
    });
  }

  /** Reconnect without returning a promise (fire-and-forget for auto-reconnect) */
  private reconnectWebSocket() {
    this.connectWebSocket().catch((err) => {
      console.error(this.tag("WS reconnect failed: " + err.message));
    });
  }

  private disconnectWebSocket() {
    const socket = this.ws;
    this.ws = null;
    this.wsConnected = false;
    this.wsUserId = "";
    this.wsSessionId = "";
    if (!socket) {
      return;
    }

    socket.removeAllListeners();
    try {
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    } catch {
      // Ignore socket shutdown errors during forced reconnects.
    }
  }

  private hasCurrentWebSocketSession(): boolean {
    return this.wsConnected && this.wsUserId === this.userId && this.wsSessionId === this.sessionId;
  }

  /** Wait until WebSocket is connected (reconnect if needed) */
  private async ensureWsConnected(): Promise<void> {
    if (this.hasCurrentWebSocketSession()) return;
    console.log(this.tag("WS not connected, reconnecting..."));
    await this.connectWebSocket();
  }

  // ── Run code ────────────────────────────────────────────────

  async runCode(
    contestTaskId: number,
    sourceCode: string,
    customInput: string,
    referer: string,
    programmingLanguageId = "1"
  ): Promise<any> {
    await this.ensureLoggedIn();
    await this.ensureWsConnected();

    if (!this.workspaceId) {
      throw new Error("No workspaceId — login may have failed silently");
    }
    console.log(this.tag(`RUN contestTaskId=${contestTaskId} wsId=${this.workspaceId} sessId=${this.sessionId}`));

    const form = new URLSearchParams({
      workspaceId: this.workspaceId,
      sessionId: this.sessionId,
      sourceCode,
      programmingLanguageId,
      customInput,
      contestTaskId: String(contestTaskId),
    });

    const res = await fetchRetry(
      "https://csacademy.com/eval/submit_custom_run/",
      {
        method: "POST",
        headers: { ...this.baseHeaders(), referer, "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      },
      { label: this.tag("POST custom_run"), retries: 3 }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Run failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    console.log(this.tag(`custom_run response: ${JSON.stringify(data)}`));
    if (data.error) {
      throw new Error(`CSAcademy run error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    return this.pollCache(data.customRunId, 60_000);
  }

  // ── Submit solution ─────────────────────────────────────────

  async submitCode(
    contestTaskId: number,
    sourceCode: string,
    referer: string,
    programmingLanguageId = "1"
  ): Promise<any> {
    await this.ensureLoggedIn();
    await this.ensureWsConnected();

    if (!this.workspaceId) {
      throw new Error("No workspaceId — login may have failed silently");
    }
    console.log(this.tag(`SUBMIT contestTaskId=${contestTaskId} wsId=${this.workspaceId} sessId=${this.sessionId}`));

    const form = new URLSearchParams({
      workspaceId: this.workspaceId,
      sessionId: this.sessionId,
      contestTaskId: String(contestTaskId),
      sourceCode,
      programmingLanguageId,
    });

    const res = await fetchRetry(
      "https://csacademy.com/eval/submit_evaljob/",
      {
        method: "POST",
        headers: { ...this.baseHeaders(), referer, "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      },
      { label: this.tag("POST evaljob"), retries: 3 }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Submit failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    console.log(this.tag(`evaljob response: ${JSON.stringify(data)}`));
    if (data.error) {
      throw new Error(`CSAcademy submit error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    const result = await this.pollCache(data.evalJobId, 120_000);

    // Convert score from 0.0-1.0 → 0-100
    if (result?.score !== undefined && result.score !== null) {
      result.score = result.score * 100;
    } else if (result?.tests) {
      const tests = result.tests as any[];
      if (tests.length > 0) {
        const sum = tests.reduce((s: number, t: any) => s + (t.checkerScore || 0), 0);
        result.score = (sum / tests.length) * 100;
      }
    }
    return result;
  }

  // ── Submit job (non-blocking) — returns evalJobId immediately ──

  async submitJobStart(
    contestTaskId: number,
    sourceCode: string,
    referer: string,
    programmingLanguageId = "1"
  ): Promise<string> {
    await this.ensureLoggedIn();
    await this.ensureWsConnected();

    if (!this.workspaceId) {
      throw new Error("No workspaceId — login may have failed silently");
    }
    console.log(this.tag(`SUBMIT_START contestTaskId=${contestTaskId} wsId=${this.workspaceId}`));

    const form = new URLSearchParams({
      workspaceId: this.workspaceId,
      sessionId: this.sessionId,
      contestTaskId: String(contestTaskId),
      sourceCode,
      programmingLanguageId,
    });

    const res = await fetchRetry(
      "https://csacademy.com/eval/submit_evaljob/",
      {
        method: "POST",
        headers: { ...this.baseHeaders(), referer, "content-type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      },
      { label: this.tag("POST evaljob (stream)"), retries: 3 }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Submit failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    console.log(this.tag(`evaljob stream response: ${JSON.stringify(data)}`));
    if (data.error) {
      throw new Error(`CSAcademy submit error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    const jobId = String(data.evalJobId);
    if (!this.resultsCache[jobId]) {
      this.resultsCache[jobId] = { tests: [], status: "pending" };
    }
    return jobId;
  }

  // ── Peek at live state of a running job ─────────────────────

  peekJob(id: string): { tests: any[]; done: boolean; score: number | null } | null {
    const entry = this.resultsCache[id];
    if (!entry) return null;

    const done = entry.status === "done";
    const tests = [...(entry.tests || [])];

    if (!done) return { tests, done: false, score: null };

    // Normalize score 0.0-1.0 → 0-100 on first read after completion
    if (!entry._scoreNormalized) {
      if (typeof entry.score === "number") {
        entry.score = entry.score * 100;
      } else if (tests.length > 0) {
        const sum = tests.reduce((s: number, t: any) => s + (t.checkerScore || 0), 0);
        entry.score = (sum / tests.length) * 100;
      } else {
        entry.score = null;
      }
      entry._scoreNormalized = true;
    }

    return { tests, done: true, score: entry.score ?? null };
  }

  // ── Release a job from the cache ────────────────────────────

  releaseJob(id: string): void {
    delete this.resultsCache[id];
  }

  // ── Poll cache ──────────────────────────────────────────────

  private pollCache(id: string | number, timeoutMs: number): Promise<any> {
    const key = String(id);
    console.log(this.tag(`pollCache waiting for key="${key}" timeout=${timeoutMs / 1000}s`));
    return new Promise((resolve, reject) => {
      const start = Date.now();
      let dotCount = 0;
      const iv = setInterval(() => {
        if (key in this.resultsCache) {
          const data = this.resultsCache[key];
          if (data.status === "pending") {
            dotCount++;
            if (dotCount % 10 === 0) {
              console.log(this.tag(`  Waiting for ${key}... ${((Date.now() - start) / 1000).toFixed(0)}s (${data.tests?.length || 0} tests so far)`));
            }
            return;
          }
          const elapsed = ((Date.now() - start) / 1000).toFixed(1);
          console.log(this.tag(`  Result ready for ${key} in ${elapsed}s`));
          clearInterval(iv);
          delete this.resultsCache[key];
          resolve(data);
        }
        if (Date.now() - start > timeoutMs) {
          console.error(this.tag(`TIMEOUT waiting for ${key} (${(timeoutMs / 1000).toFixed(0)}s). WS=${this.wsConnected}`));
          console.error(this.tag(`  Cache keys: [${Object.keys(this.resultsCache).join(", ")}]`));
          clearInterval(iv);
          reject(new Error(`Timeout waiting for ${key} (${(timeoutMs / 1000).toFixed(0)}s). WS=${this.wsConnected}`));
        }
      }, 500);
    });
  }

  getStatus() {
    return {
      loggedIn: this.loggedIn,
      wsConnected: this.wsConnected,
      userId: this.userId,
      workspaceId: this.workspaceId,
    };
  }
}

// ══════════════════════════════════════════════════════════════
// CSAcademyManager — singleton that manages all sessions
// ══════════════════════════════════════════════════════════════

class CSAcademyManager {
  private sessions = new Map<string, CSAcademySession>();

  getOrCreate(csaEmail: string, csaPassword: string): CSAcademySession {
    let sess = this.sessions.get(csaEmail);
    if (!sess) {
      sess = new CSAcademySession(csaEmail, csaPassword);
      this.sessions.set(csaEmail, sess);
    }
    return sess;
  }

  async runCode(
    csaEmail: string,
    csaPassword: string,
    contestTaskId: number,
    sourceCode: string,
    customInput: string,
    referer: string,
    langId = "1"
  ) {
    const sess = this.getOrCreate(csaEmail, csaPassword);
    return sess.runCode(contestTaskId, sourceCode, customInput, referer, langId);
  }

  async submitCode(
    csaEmail: string,
    csaPassword: string,
    contestTaskId: number,
    sourceCode: string,
    referer: string,
    langId = "1"
  ) {
    const sess = this.getOrCreate(csaEmail, csaPassword);
    return sess.submitCode(contestTaskId, sourceCode, referer, langId);
  }

  async submitJobStart(
    csaEmail: string,
    csaPassword: string,
    contestTaskId: number,
    sourceCode: string,
    referer: string,
    langId = "1"
  ): Promise<string> {
    const sess = this.getOrCreate(csaEmail, csaPassword);
    return sess.submitJobStart(contestTaskId, sourceCode, referer, langId);
  }

  peekJob(csaEmail: string, jobId: string) {
    const sess = this.sessions.get(csaEmail);
    return sess?.peekJob(jobId) ?? null;
  }

  releaseJob(csaEmail: string, jobId: string) {
    const sess = this.sessions.get(csaEmail);
    sess?.releaseJob(jobId);
  }
}

export const csaManager = new CSAcademyManager();
