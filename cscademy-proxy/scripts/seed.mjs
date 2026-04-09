/**
 * Seed script — creates users, fetches CSAcademy programming languages,
 * and seeds track problems + languages into the database.
 *
 * Run with: node scripts/seed.mjs
 */
import { ConvexHttpClient } from "convex/browser";
import bcrypt from "bcryptjs";

const CONVEX_URL =
  process.env.NEXT_PUBLIC_CONVEX_URL || "http://127.0.0.1:3210";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const client = new ConvexHttpClient(CONVEX_URL);

// ── CSAcademy language fetcher ─────────────────────────────────

/** Map CSAcademy aceMode to our installed CodeMirror language extensions */
function aceToCodemirrorMode(aceMode) {
  const map = {
    c_cpp: "cpp",
    java: "java",
    python: "python",
    javascript: "javascript",
    csharp: "java",       // similar C-style syntax
    golang: "cpp",        // C-like
    rust: "cpp",          // C-like
    kotlin: "java",       // JVM/C-style
    scala: "java",        // JVM-style
    swift: "cpp",         // C-like
    objectivec: "cpp",    // C-like
  };
  return map[aceMode] || "cpp";
}

/**
 * Fetch all programming languages from CSAcademy's PublicState.js bundle.
 * Returns array of { langId, name, codemirrorMode, order, defaultSource }.
 */
async function fetchCSALanguages() {
  console.log("Fetching programming languages from CSAcademy...");
  try {
    const res = await fetch(
      "https://csacademy.com/static/js/PublicState.js?v=578",
      { headers: { "User-Agent": USER_AGENT } }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    // Extract language entries via regex
    const regex =
      /\{"id":\s*(\d+),\s*"name":\s*"([^"]+)",\s*"isCompiled":\s*(?:true|false),\s*"extension":\s*"([^"]+)",\s*"aceMode":\s*"([^"]+)",\s*"defaultSource":\s*"((?:[^"\\]|\\.)*)"/g;
    let m;
    const langs = [];
    while ((m = regex.exec(text))) {
      const defaultSource = m[5]
        .replace(/\\r\\n/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\\t/g, "\t")
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"');
      langs.push({
        langId: String(m[1]),
        name: m[2],
        codemirrorMode: aceToCodemirrorMode(m[4]),
        order: parseInt(m[1]),
        defaultSource,
      });
    }

    if (langs.length > 0) {
      langs.sort((a, b) => a.order - b.order);
      console.log(`✓ Fetched ${langs.length} languages from CSAcademy`);
      return langs;
    }
    throw new Error("No languages found in PublicState.js");
  } catch (e) {
    console.log("⚠ Could not fetch from CSAcademy:", e.message);
    console.log("  Using hardcoded fallback language list");
    return FALLBACK_LANGUAGES;
  }
}

// Complete fallback list with correct CSAcademy IDs (verified May 2025)
const FALLBACK_LANGUAGES = [
  { langId: "1",  name: "C++",          codemirrorMode: "cpp",        order: 1 },
  { langId: "2",  name: "Java",         codemirrorMode: "java",       order: 2 },
  { langId: "3",  name: "Python 2",     codemirrorMode: "python",     order: 3 },
  { langId: "4",  name: "Python 3",     codemirrorMode: "python",     order: 4 },
  { langId: "5",  name: "C#",           codemirrorMode: "java",       order: 5 },
  { langId: "6",  name: "Haskell",      codemirrorMode: "cpp",        order: 6 },
  { langId: "7",  name: "BASH",         codemirrorMode: "cpp",        order: 7 },
  { langId: "8",  name: "Fortran",      codemirrorMode: "cpp",        order: 8 },
  { langId: "9",  name: "Lua",          codemirrorMode: "python",     order: 9 },
  { langId: "10", name: "Ruby",         codemirrorMode: "python",     order: 10 },
  { langId: "11", name: "Perl",         codemirrorMode: "python",     order: 11 },
  { langId: "12", name: "PHP",          codemirrorMode: "cpp",        order: 12 },
  { langId: "13", name: "C",            codemirrorMode: "cpp",        order: 13 },
  { langId: "14", name: "Objective-C",  codemirrorMode: "cpp",        order: 14 },
  { langId: "15", name: "Smalltalk",    codemirrorMode: "cpp",        order: 15 },
  { langId: "16", name: "OCaml",        codemirrorMode: "cpp",        order: 16 },
  { langId: "17", name: "Javascript",   codemirrorMode: "javascript", order: 17 },
  { langId: "18", name: "COBOL",        codemirrorMode: "cpp",        order: 18 },
  { langId: "19", name: "Ada",          codemirrorMode: "cpp",        order: 19 },
  { langId: "20", name: "Pascal",       codemirrorMode: "cpp",        order: 20 },
  { langId: "21", name: "Common LISP",  codemirrorMode: "cpp",        order: 21 },
  { langId: "22", name: "Erlang",       codemirrorMode: "cpp",        order: 22 },
  { langId: "23", name: "Tcl",          codemirrorMode: "cpp",        order: 23 },
  { langId: "24", name: "Octave",       codemirrorMode: "cpp",        order: 24 },
  { langId: "25", name: "Go",           codemirrorMode: "cpp",        order: 25 },
  { langId: "26", name: "Swift",        codemirrorMode: "cpp",        order: 26 },
  { langId: "27", name: "Scala",        codemirrorMode: "java",       order: 27 },
  { langId: "28", name: "Pypy 2",       codemirrorMode: "python",     order: 28 },
  { langId: "29", name: "Pypy3",        codemirrorMode: "python",     order: 29 },
  { langId: "30", name: "Kotlin",       codemirrorMode: "java",       order: 30 },
  { langId: "31", name: "Rust",         codemirrorMode: "cpp",        order: 31 },
  { langId: "32", name: "Julia",        codemirrorMode: "python",     order: 32 },
];

// ── Starter code builder ───────────────────────────────────────

/** Build starterCode JSON from language list (uses defaultSource when available) */
function buildStarterCode(languages) {
  const map = {};
  for (const lang of languages) {
    map[lang.langId] = lang.defaultSource || "";
  }
  return JSON.stringify(map);
}

// ── Problem definitions ────────────────────────────────────────

function getProblems(starterCodeJson) {
  return [
    {
      trackSlug: "algorithmics",
      slug: "sequence-decomposition",
      name: "Sequence Decomposition",
      description: `An ancient ancestral saying states that the number 112012 brings good luck in any form it may appear (that is, as the number 112012, as the sequence {1,1,2,0,1,2}, among others). Moreover, it is said that a sequence of characters consisting only of 0, 1, and 2 is considered fortunate if it can be decomposed into multiple subsequences {1,1,2,0,1,2}.

Miguel has some fortunate sequences, and he will only give them to you if you can find a valid decomposition for each one.

Note: A subsequence of a sequence S is a sequence that can be derived from S by deleting zero or more elements without changing the order of the remaining elements.

Input
The first line contains an integer T, denoting the number of sequences.
Each of the next T lines contains a sequence Si to be decomposed.

Output
For each sequence Si, in the order of input, print |Si|/6 lines, each containing 6 integers in increasing order, representing the indices of a subsequence {1,1,2,0,1,2} such that all of them together decompose the sequence Si. If there are multiple valid answers, you may print any of them.

Constraints
• 1 ≤ T ≤ 2×10⁵
• 1 ≤ |Si| ≤ 6×10⁵
• 1 ≤ Σ|Si| ≤ 3×10⁶
• Si is fortunate for all i`,
      points: 100,
      order: 1,
      sampleInput: `3
112012
111122001122
111121102110112202012212`,
      sampleOutput: `1 2 3 4 5 6
1 2 5 7 9 11
3 4 6 8 10 12
1 2 5 8 13 18
3 4 9 12 14 21
6 7 15 17 20 22
10 11 16 19 23 24`,
      starterCode: starterCodeJson,
      contestTaskId: 51724,
      referer:
        "https://csacademy.com/ieeextreme-practice/task/sequence-decomposition/",
    },
    {
      trackSlug: "algorithmics",
      slug: "one-letter",
      name: "One Letter",
      description: `You are given a list of N words. From each word you should keep only one letter and discard all the others. Then you should permute the N chosen letters and build a single word by concatenating them. Find the lexicographically smallest word you can obtain.

Input
The first line contains a single integer value N.
Each of the following N lines contains a single string, representing one of the words.

Output
The output should contain one string of length N.

Constraints
• 1 ≤ N ≤ 10⁵
• The sum of lengths of the strings is ≤ 10⁵
• The strings will contain only lower case letters of the English alphabet.`,
      points: 100,
      order: 2,
      sampleInput: `3
cross
stop
arm`,
      sampleOutput: "aco",
      starterCode: starterCodeJson,
      contestTaskId: 680,
      referer:
        "https://csacademy.com/contest/interview-archive/task/one_letter/",
    },
    {
      trackSlug: "software-engineering",
      slug: "visitor",
      name: "Visitor Pattern Challenge",
      description: `Clone the public starter repository, implement the required fixes, and make the test suite pass.

Workflow
1. Clone the public starter repository locally.
2. Work on the task until the tests pass.
3. Push your solution to a private GitHub repository.
4. Create a fine-grained GitHub token with contents:read access to that repository.
5. Submit the private repository URL, token, and the branch that contains your solution.

Evaluation
The platform runs a Docker challenge runner against your private branch with:
- REPO_URL=https://github.com/<user>/<repo>
- SUBMISSION_REF=challenge
- BASE_COMMIT=fe8afb3
- ACCESS_TOKEN=github_pat_<...>
- image: ajiztech/challenge-1

Result rules
- {"status":"passed","tokenCount":4789,"score":13.20} means the score is 13.20
- fatal: could not read Username for 'https://github.com': No such device or address means the token did not work
- fatal: couldn't find remote ref <branch> means the submitted branch does not exist
- {"status":"failed","reason":"tests failed"} means evaluation completed but the tests did not pass`,
      points: 100,
      order: 1,
      publicRepositoryUrl: "https://github.com/ajiz-org/software-engineering-challenge",
      evaluationImage: "ajiztech/challenge-1",
      baseCommit: "fe8afb3ab6564b1af14b8c1a80e78bd3668868be",
      defaultSubmissionRef: "main",
    },
    {
      trackSlug: "logic-reverse-engineering",
      slug: "hardest-logic-puzzle",
      name: "Hardest Logic Puzzle",
      description: `Download the public judge file and submit a single JavaScript expression string.

Evaluation flow
1. Download the judge file for this challenge.
2. Reverse engineer the accepted expression format from the file itself.
3. Submit only the expression string, not a full program.
4. The platform runs the same judge inside an isolated Node.js Docker container.

Scoring rule
- If the final judge output is {"ok":true}, you receive the full score.
- Any other output or runtime failure scores 0.` ,
      points: 100,
      order: 1,
      judgeFilePath: "/test.ts",
      starterSubmission: "",
    },
  ];
}

// ── Main seed function ─────────────────────────────────────────

async function seed() {
  console.log("Seeding database at", CONVEX_URL);

  // 1. Create admin user
  const adminHash = await bcrypt.hash("admin123", 10);
  try {
    const adminId = await client.mutation("users:create", {
      name: "Admin",
      email: "admin@tech.ajiz.org",
      passwordHash: adminHash,
      role: "admin",
    });
    console.log("✓ Admin user created:", adminId);

    // Link the evaluation account to the admin user for testing.
    await client.mutation("csacademyAccounts:upsert", {
      userId: adminId,
      csaEmail: "binoz.daop@gmail.com",
      csaPassword: "aAaA1&1&",
    });
    console.log("✓ Evaluation account linked to admin");
  } catch (e) {
    console.log("Admin user might already exist:", e.message);
  }

  // 2. Create a sample student
  const studentHash = await bcrypt.hash("student123", 10);
  try {
    const studentId = await client.mutation("users:create", {
      name: "Test Student",
      email: "student@tech.ajiz.org",
      passwordHash: studentHash,
      role: "student",
    });
    console.log("✓ Student user created:", studentId);
  } catch (e) {
    console.log("Student user might already exist:", e.message);
  }

  // 3. Fetch CSAcademy programming languages
  const languages = await fetchCSALanguages();
  const starterCodeJson = buildStarterCode(languages);

  // 4. Clear old track data (idempotent re-seed)
  const clearedLangs = await client.mutation(
    "programmingLanguages:clearByTrack",
    { trackSlug: "algorithmics" }
  );
  const clearedProblems = await client.mutation(
    "trackProblems:clearByTrack",
    { trackSlug: "algorithmics" }
  );
  const clearedSoftwareEngineeringLangs = await client.mutation(
    "programmingLanguages:clearByTrack",
    { trackSlug: "software-engineering" }
  );
  const clearedSoftwareEngineeringProblems = await client.mutation(
    "trackProblems:clearByTrack",
    { trackSlug: "software-engineering" }
  );
  const clearedLogicReverseEngineeringLangs = await client.mutation(
    "programmingLanguages:clearByTrack",
    { trackSlug: "logic-reverse-engineering" }
  );
  const clearedLogicReverseEngineeringProblems = await client.mutation(
    "trackProblems:clearByTrack",
    { trackSlug: "logic-reverse-engineering" }
  );
  if (
    clearedLangs ||
    clearedProblems ||
    clearedSoftwareEngineeringLangs ||
    clearedSoftwareEngineeringProblems ||
    clearedLogicReverseEngineeringLangs ||
    clearedLogicReverseEngineeringProblems
  )
    console.log(
      `✓ Cleared ${
        clearedLangs +
        clearedSoftwareEngineeringLangs +
        clearedLogicReverseEngineeringLangs
      } old languages, ${
        clearedProblems +
        clearedSoftwareEngineeringProblems +
        clearedLogicReverseEngineeringProblems
      } old problems`
    );

  // 5. Seed languages for the algorithmics track
  for (const lang of languages) {
    const { defaultSource, ...langFields } = lang;
    await client.mutation("programmingLanguages:create", {
      trackSlug: "algorithmics",
      ...langFields,
    });
    console.log(`✓ Language "${lang.name}" (id=${lang.langId}) created`);
  }

  // 6. Seed problems for the algorithmics track
  const problems = getProblems(starterCodeJson);
  for (const p of problems) {
    await client.mutation("trackProblems:create", p);
    console.log(`✓ Problem "${p.name}" created`);
  }

  console.log("\n=== Seed complete ===");
  console.log("Admin login:   admin@tech.ajiz.org / admin123");
  console.log("Student login: student@tech.ajiz.org / student123");
  console.log(`Languages seeded: ${languages.length}`);
  console.log(`Problems seeded: ${problems.length}`);
}

seed().catch(console.error);
