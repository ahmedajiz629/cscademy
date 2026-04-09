import type { TrackModule } from "./types";

const ctf: TrackModule = {
  id: "ctf",
  name: "CTF",
  description:
    "Flag-based security challenges with optional downloads and external resources.",
  icon: "🚩",
  isActive: true,
  order: 4,
  runEndpoint: "/api/ctf/submit",
  submitEndpoint: "/api/ctf/submit",
  problemsApiPath: "/api/tracks/ctf/problems",
  buildProblemPath: (problemSlug) => `/tracks/ctf/problems/${problemSlug}`,
  buildProblemApiPath: (problemSlug) => `/api/tracks/ctf/problems/${problemSlug}`,
};

export default ctf;