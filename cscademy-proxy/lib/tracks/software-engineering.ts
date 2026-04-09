import type { TrackModule } from "./types";

const softwareEngineering: TrackModule = {
  id: "software-engineering",
  name: "Software Engineering",
  description:
    "Repository-based engineering challenges evaluated from a Git branch inside an isolated Docker runner.",
  icon: "🛠",
  isActive: true,
  order: 2,
  runEndpoint: "/api/software-engineering/evaluate",
  submitEndpoint: "/api/software-engineering/evaluate",
  problemsApiPath: "/api/tracks/software-engineering/problems",
  buildProblemPath: (problemSlug) =>
    `/tracks/software-engineering/problems/${problemSlug}`,
  buildProblemApiPath: (problemSlug) =>
    `/api/tracks/software-engineering/problems/${problemSlug}`,
};

export default softwareEngineering;