const CSACADEMY_BASE_URL = "https://csacademy.com";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type CsacademyContest = {
  id: number;
  name: string;
};

type CsacademyContestTask = {
  id: number;
  contestId: number;
  name: string;
  longName: string;
  evalTaskId: number;
  pointsWorth?: number;
};

type CsacademyEvalTask = {
  id: number;
  urlName: string;
  longName: string;
  statementArticleId: number;
  exampleTests?: Array<{
    input?: string;
    output?: string;
  }>;
};

type CsacademyArticle = {
  id: number;
  baseArticleId: number | null;
  languageId: number;
  markup: string;
};

type ContestTaskResponse = {
  state?: {
    Contest?: CsacademyContest[];
    contesttask?: CsacademyContestTask[];
    EvalTask?: CsacademyEvalTask[];
    article?: CsacademyArticle[];
  };
};

type ImportedAlgorithmicsProblem = {
  contestTaskId: number;
  slug: string;
  name: string;
  description: string;
  points: number;
  sampleTests: Array<{ input?: string; output?: string }>;
  starterCode: string;
  referer: string;
};

type CsacademyLanguage = {
  langId: string;
  defaultSource?: string;
};

function parseCookies(setCookieHeader: string | null): Record<string, string> {
  if (!setCookieHeader) {
    return {};
  }

  const cookies: Record<string, string> = {};
  const parts = setCookieHeader.split(/,\s*(?=[A-Za-z0-9_-]+=)/);

  for (const part of parts) {
    const firstSegment = part.split(";", 1)[0]?.trim();
    if (!firstSegment) {
      continue;
    }

    const eqIndex = firstSegment.indexOf("=");
    if (eqIndex <= 0) {
      continue;
    }

    const name = firstSegment.slice(0, eqIndex).trim();
    const value = firstSegment.slice(eqIndex + 1).trim();
    if (name) {
      cookies[name] = value;
    }
  }

  return cookies;
}

function encodeFormData(fields: Record<string, string | number | boolean>) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(fields)) {
    params.set(key, String(value));
  }

  return params.toString();
}

function buildCookieHeader(cookies: Record<string, string>) {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeLatex(value: string) {
  return decodeHtmlEntities(value)
    .replace(/\\leq/g, "<=")
    .replace(/\\geq/g, ">=")
    .replace(/\\times/g, "x")
    .replace(/\\cdot/g, "*")
    .replace(/\\neq/g, "!=")
    .replace(/\\ldots/g, "...")
    .replace(/\\,/g, " ")
    .replace(/[{}]/g, "")
    .trim();
}

function normalizeStatementMarkup(markup: string) {
  const normalized = markup.replace(/\r\n?/g, "\n");
  const withoutWidgets = normalized
    .replace(/<TaskExamples\s*\/>/g, "")
    .replace(/<Latex\s+value="([^"]*)"\s*\/>/g, (_, value: string) =>
      normalizeLatex(value)
    )
    .replace(/<[^>]+>/g, "");

  const lines = withoutWidgets.split("\n");
  const output: string[] = [];

  for (const rawLine of lines) {
    const line = decodeHtmlEntities(rawLine).trimEnd();
    const headingMatch = line.match(/^#\d+\s+(.*)$/);

    if (headingMatch) {
      if (output.length > 0 && output[output.length - 1] !== "") {
        output.push("");
      }
      output.push(headingMatch[1].trim());
      continue;
    }

    output.push(line);
  }

  return output
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeSampleText(value?: string) {
  if (!value) {
    return undefined;
  }

  const trimmed = value.replace(/\r\n?/g, "\n").replace(/\n+$/g, "");
  return trimmed || undefined;
}

function normalizeProblemSlug(urlName: string) {
  return urlName
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildContestTaskReferer(contest: CsacademyContest, contestTask: CsacademyContestTask) {
  const isTopLevelContest =
    contest.name.startsWith("ieeextreme") || contest.name.startsWith("prextreme");
  const contestPrefix = isTopLevelContest ? "/" : "/contest/";
  return `${CSACADEMY_BASE_URL}${contestPrefix}${contest.name}/task/${contestTask.name}/`;
}

async function getCsacademySessionCookies() {
  const response = await fetch(`${CSACADEMY_BASE_URL}/`, {
    headers: {
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`CSAcademy bootstrap failed (HTTP ${response.status}).`);
  }

  const setCookieHeader =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie().join(", ")
      : response.headers.get("set-cookie");
  const cookies = parseCookies(setCookieHeader);
  const csrfToken = cookies.csrftoken;

  if (!csrfToken) {
    throw new Error("CSAcademy bootstrap failed to return a CSRF token.");
  }

  return { cookies, csrfToken };
}

async function postContestTaskLookup(contestTaskId: number) {
  const { cookies, csrfToken } = await getCsacademySessionCookies();
  const response = await fetch(`${CSACADEMY_BASE_URL}/contest/get_contest_task/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": USER_AGENT,
      Cookie: buildCookieHeader(cookies),
      Origin: CSACADEMY_BASE_URL,
      Referer: `${CSACADEMY_BASE_URL}/`,
      "X-CSRFToken": csrfToken,
      "X-Requested-With": "XMLHttpRequest",
    },
    body: encodeFormData({
      contestTaskId,
      requestContestTask: true,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`CSAcademy task lookup failed (HTTP ${response.status}).`);
  }

  return (await response.json()) as ContestTaskResponse;
}

function aceToCodemirrorMode(aceMode: string) {
  const map: Record<string, string> = {
    c_cpp: "cpp",
    java: "java",
    python: "python",
    javascript: "javascript",
    csharp: "java",
    golang: "cpp",
    rust: "cpp",
    kotlin: "java",
    scala: "java",
    swift: "cpp",
    objectivec: "cpp",
  };

  return map[aceMode] || "cpp";
}

async function fetchCsacademyLanguages() {
  const response = await fetch(`${CSACADEMY_BASE_URL}/static/js/PublicState.js?v=584`, {
    headers: {
      "User-Agent": USER_AGENT,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`CSAcademy language fetch failed (HTTP ${response.status}).`);
  }

  const source = await response.text();
  const regex =
    /\{"id":\s*(\d+),\s*"name":\s*"([^"]+)",\s*"isCompiled":\s*(?:true|false),\s*"extension":\s*"([^"]+)",\s*"aceMode":\s*"([^"]+)",\s*"defaultSource":\s*"((?:[^"\\]|\\.)*)"/g;
  const languages: CsacademyLanguage[] = [];

  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(source))) {
    languages.push({
      langId: match[1],
      defaultSource: match[5]
        .replace(/\\r\\n/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"'),
    });
  }

  if (languages.length > 0) {
    return languages;
  }

  throw new Error("No CSAcademy languages found in PublicState.js.");
}

function buildStarterCode(languages: CsacademyLanguage[]) {
  const starterCode: Record<string, string> = {};

  for (const language of languages) {
    starterCode[language.langId] = language.defaultSource || "";
  }

  return JSON.stringify(starterCode);
}

export async function importAlgorithmicsProblemFromCsacademy(
  contestTaskId: number
): Promise<ImportedAlgorithmicsProblem> {
  const lookup = await postContestTaskLookup(contestTaskId);
  const contests = lookup.state?.Contest || [];
  const contestTasks = lookup.state?.contesttask || [];
  const evalTasks = lookup.state?.EvalTask || [];
  const articles = lookup.state?.article || [];

  const contestTask = contestTasks.find((item) => item.id === contestTaskId);
  if (!contestTask) {
    throw new Error(`CSAcademy task ${contestTaskId} was not found.`);
  }

  const contest = contests.find((item) => item.id === contestTask.contestId);
  if (!contest) {
    throw new Error(`CSAcademy contest ${contestTask.contestId} was not returned.`);
  }

  const evalTask = evalTasks.find((item) => item.id === contestTask.evalTaskId);
  if (!evalTask) {
    throw new Error(`CSAcademy eval task ${contestTask.evalTaskId} was not returned.`);
  }

  const statementArticle = articles.find(
    (item) => item.id === evalTask.statementArticleId
  );
  if (!statementArticle) {
    throw new Error(
      `CSAcademy statement article ${evalTask.statementArticleId} was not returned.`
    );
  }

  const languages = await fetchCsacademyLanguages();
  const firstExample = evalTask.exampleTests?.[0];

  return {
    contestTaskId,
    slug: normalizeProblemSlug(evalTask.urlName || contestTask.name),
    name: contestTask.longName || evalTask.longName,
    description: normalizeStatementMarkup(statementArticle.markup),
    points: Math.round(contestTask.pointsWorth || 100),
    sampleTests: (evalTask.exampleTests || [])
      .map((ex) => ({
        input: normalizeSampleText(ex.input),
        output: normalizeSampleText(ex.output),
      }))
      .filter((ex) => ex.input !== undefined || ex.output !== undefined),
    starterCode: buildStarterCode(languages),
    referer: buildContestTaskReferer(contest, contestTask),
  };
}

export function getCsacademyLanguageMode(aceMode: string) {
  return aceToCodemirrorMode(aceMode);
}