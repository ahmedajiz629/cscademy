import type { TrackModule } from "./types";

const algorithmics: TrackModule = {
  id: "algorithmics",
  name: "Algorithmics",
  description:
    "Algorithmic programming challenges — solve problems using efficient data structures and algorithms.",
  icon: "⚡",
  isActive: true,
  order: 1,
  runEndpoint: "/api/csacademy/run",
  submitEndpoint: "/api/csacademy/submit",
};

export default algorithmics;
