/**
 * CSAcademy Session Manager — class-based, supports multiple concurrent
 * CSAcademy sessions (one per linked CSAcademy account).
 *
 * Preserves the working login flow:
 *   1. GET https://csacademy.com/  → csrftoken cookie
 *   2. POST /accounts/login/       → username+password (form), success+cookies
 *   3. GET /workspace/              → JSON with state.Workspace[{id,userId}]
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
    if (this.loggedIn) return;
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

    // Step 3: GET /workspace/ with XHR → JSON {state: {Workspace: [...]}}
    const updatedCsrf = allCookies["csrftoken"] || csrfToken;
    const cookieStr = cookieString(allCookies);

    try {
      const wsRes = await fetchRetry(
        "https://csacademy.com/workspace/",
        {
          headers: {
            "User-Agent": USER_AGENT,
            Cookie: cookieStr,
            "X-CSRFToken": updatedCsrf,
            "X-Requested-With": "XMLHttpRequest",
            Accept: "application/json",
          },
        },
        { label: this.tag("GET workspace"), retries: 2 }
      );
      if (wsRes.ok) {
        const wsData = await wsRes.json();
        const workspaces = wsData?.state?.Workspace || [];
        if (workspaces.length > 0) {
          this.workspaceId = String(workspaces[0].id || "");
          this.userId = String(workspaces[0].userId || "");
        }
      }
    } catch (e: any) {
      console.error(this.tag("Could not fetch workspace: " + e.message));
    }

    // Fallback: get userId from homepage HTML
    if (!this.userId) {
      try {
        const homeRes = await fetchRetry(
          "https://csacademy.com/",
          { headers: { "User-Agent": USER_AGENT, Cookie: cookieStr, Accept: "text/html" } },
          { label: this.tag("GET homepage for userId"), retries: 2 }
        );
        const html = await homeRes.text();
        const m = html.match(/"id"\s*:\s*(\d+)/);
        if (m) this.userId = m[1];
      } catch { /* ignore */ }
    }

    this.cookies = cookieStr;
    this.csrfToken = updatedCsrf;
    this.loggedIn = true;

    console.log(this.tag(`LOGIN COMPLETE in ${((Date.now() - t0) / 1000).toFixed(1)}s — user=${this.userId} ws=${this.workspaceId}`));
    this.connectWebSocket();
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

  private connectWebSocket() {
    if (this.ws && this.wsConnected) return;

    this.ws = new WebSocket(WS_URL, {
      headers: {
        "User-Agent": USER_AGENT,
        Origin: "https://csacademy.com",
        Cookie: this.cookies,
      },
    });

    this.ws.on("open", () => {
      this.wsConnected = true;
      console.log(this.tag("WS CONNECTED"));
      if (!this.ws) return;
      const channels = [
        "global-events",
        `workspacesession-${this.userId}-${this.sessionId}`,
      ];
      for (const ch of channels) {
        this.ws.send(`s ${ch} ${ch.length + 2}`);
      }
    });

    this.ws.on("message", (data: WebSocket.Data) => {
      const msg = data.toString();
      if (!msg.startsWith("m ")) return;
      try {
        const jsonStart = msg.indexOf("{");
        if (jsonStart === -1) return;
        const parsed = JSON.parse(msg.substring(jsonStart));

        // Custom run results
        if (parsed.objectType === "customrun" && parsed.objectId) {
          const id = parsed.objectId;
          if (parsed.type === "runResults") {
            this.resultsCache[id] = parsed.data;
          } else if (parsed.type === "compile_status") {
            if (!parsed.data?.compileOK) {
              this.resultsCache[id] = {
                error: parsed.data?.compilerMessage || "Compilation failed",
              };
            }
          }
        }

        // Eval job results
        if (parsed.objectType === "evaljob" && parsed.objectId) {
          const id = parsed.objectId;
          if (!this.resultsCache[id]) {
            this.resultsCache[id] = { tests: [], status: "pending" };
          }
          if (parsed.type === "test_results") {
            const tests = parsed.data?.tests || {};
            for (const [, tdata] of Object.entries(tests)) {
              this.resultsCache[id].tests.push(tdata);
            }
          } else if (parsed.type === "finished" || parsed.type === "done") {
            this.resultsCache[id].status = "done";
            if (parsed.data) Object.assign(this.resultsCache[id], parsed.data);
          }
        }
      } catch { /* ignore parse error */ }
    });

    this.ws.on("close", () => {
      this.wsConnected = false;
      console.log(this.tag("WS disconnected, reconnecting in 2s..."));
      setTimeout(() => this.connectWebSocket(), 2000);
    });

    this.ws.on("error", (err: Error) => {
      console.error(this.tag("WS error: " + err.message));
    });
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

  // ── Poll cache ──────────────────────────────────────────────

  private pollCache(id: string, timeoutMs: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const iv = setInterval(() => {
        if (id in this.resultsCache) {
          const data = this.resultsCache[id];
          if (data.status === "pending") return;
          clearInterval(iv);
          delete this.resultsCache[id];
          resolve(data);
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(iv);
          reject(new Error(`Timeout waiting for ${id} (${(timeoutMs / 1000).toFixed(0)}s). WS=${this.wsConnected}`));
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
}

export const csaManager = new CSAcademyManager();
