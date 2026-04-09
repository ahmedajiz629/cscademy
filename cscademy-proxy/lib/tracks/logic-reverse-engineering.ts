import type { TrackModule } from "./types";

const logicReverseEngineering: TrackModule = {
  id: "logic-reverse-engineering",
  name: "Logic & Reverse Engineering",
  description:
    "String-based solver challenges verified by a downloadable judge running inside a configurable Docker evaluation.",
  icon: "🧠",
  isActive: true,
  order: 3,
  runEndpoint: "/api/logic-reverse-engineering/evaluate",
  submitEndpoint: "/api/logic-reverse-engineering/evaluate",
  problemsApiPath: "/api/tracks/logic-reverse-engineering/problems",
  buildProblemPath: (problemSlug) =>
    `/tracks/logic-reverse-engineering/problems/${problemSlug}`,
  buildProblemApiPath: (problemSlug) =>
    `/api/tracks/logic-reverse-engineering/problems/${problemSlug}`,
};

export default logicReverseEngineering;