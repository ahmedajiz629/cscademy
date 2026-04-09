import { readFileSync } from "node:fs";
import { ConvexHttpClient } from "convex/browser";

function readEnvValue(name) {
  if (process.env[name]) {
    return process.env[name];
  }

  try {
    const text = readFileSync(".env.local", "utf8");
    const line = text
      .split(/\r?\n/)
      .find((entry) => entry.startsWith(`${name}=`));

    if (!line) {
      return undefined;
    }

    return line.slice(name.length + 1).trim().replace(/^"|"$/g, "");
  } catch {
    return undefined;
  }
}

const CONVEX_URL =
  readEnvValue("NEXT_PUBLIC_CONVEX_URL") || "http://127.0.0.1:3210";

const client = new ConvexHttpClient(CONVEX_URL);

const problem = {
  trackSlug: "software-engineering",
  slug: "challenge-1",
  name: "Challenge 1",
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
- BASE_COMMIT=fe8afb
- ACCESS_TOKEN=github_pat_<...>
- image: ajiztech/challenge-1

Result rules
- {"status":"passed","tokenCount":4789,"score":13.20} means the score is 13.20
- fatal: could not read Username for 'https://github.com': No such device or address means the token did not work
- fatal: couldn't find remote ref <branch> means the submitted branch does not exist
- {"status":"failed","reason":"tests failed"} means evaluation completed but the tests did not pass`,
  points: 100,
  order: 1,
  evaluationImage: "ajiztech/challenge-1",
  baseCommit: "fe8afb",
  defaultSubmissionRef: "challenge",
  isOffline: false,
};

async function seedSoftwareEngineeringTrack() {
  const existing = await client.query("trackProblems:listByTrackAdmin", {
    trackSlug: "software-engineering",
  });

  const matched = existing.find((entry) => entry.slug === problem.slug);
  const target = matched || (existing.length === 1 ? existing[0] : null);

  if (existing.length > 1 && !matched) {
    throw new Error(
      "Software engineering track already has multiple problems; refusing to modify it automatically."
    );
  }

  if (target) {
    await client.mutation("trackProblems:update", {
      id: target._id,
      name: problem.name,
      description: problem.description,
      points: problem.points,
      order: problem.order,
      evaluationImage: problem.evaluationImage,
      baseCommit: problem.baseCommit,
      defaultSubmissionRef: problem.defaultSubmissionRef,
      isOffline: false,
    });
    console.log(`Updated software engineering challenge (${target.slug}).`);
    return;
  }

  await client.mutation("trackProblems:create", problem);
  console.log("Created software engineering challenge.");
}

seedSoftwareEngineeringTrack().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});