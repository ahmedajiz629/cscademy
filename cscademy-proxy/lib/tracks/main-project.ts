import type { TrackModule } from "./types";

const mainProject: TrackModule = {
  id: "main-project",
  name: "Main Project",
  description:
    "Project delivery challenges with a controlled depot window for final archive, presentation, report, and demo submissions.",
  icon: "📦",
  isActive: true,
  order: 5,
  runEndpoint: "/api/main-project/submit",
  submitEndpoint: "/api/main-project/submit",
  problemsApiPath: "/api/tracks/main-project/problems",
  buildProblemPath: (problemSlug) => `/tracks/main-project/problems/${problemSlug}`,
  buildProblemApiPath: (problemSlug) => `/api/tracks/main-project/problems/${problemSlug}`,
};

export default mainProject;