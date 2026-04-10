import type { Doc, Id } from "./_generated/dataModel";

const TRACK_LABELS: Record<string, string> = {
  algorithmics: "Algorithmics",
  "software-engineering": "Software Engineering",
  "logic-reverse-engineering": "Logic & Reverse Engineering",
  ctf: "CTF",
};

export function getTrackLabel(trackSlug: string) {
  return TRACK_LABELS[trackSlug] ?? trackSlug;
}

export async function insertNotification(
  ctx: any,
  {
    title,
    message,
    kind,
    level,
    targetRole = "student",
    trackSlug,
    problemSlug,
    createdByUserId,
  }: {
    title: string;
    message: string;
    kind:
      | "custom"
      | "track_opened"
      | "track_closed"
      | "problem_opened"
      | "problem_closed";
    level: "info" | "success" | "warning";
    targetRole?: "student" | "admin" | "all";
    trackSlug?: string;
    problemSlug?: string;
    createdByUserId?: Id<"users">;
  }
) {
  const cleanTitle = title.trim();
  const cleanMessage = message.trim();

  if (!cleanTitle || !cleanMessage) {
    return null;
  }

  return ctx.db.insert("notifications", {
    title: cleanTitle,
    message: cleanMessage,
    kind,
    level,
    targetRole,
    trackSlug,
    problemSlug,
    createdAt: Date.now(),
    createdByUserId,
  });
}

export async function insertTrackAvailabilityNotification(
  ctx: any,
  trackSlug: string,
  isActive: boolean
) {
  const trackName = getTrackLabel(trackSlug);

  return insertNotification(ctx, {
    title: isActive ? `${trackName} opened` : `${trackName} closed`,
    message: isActive
      ? `${trackName} is now available to participants.`
      : `${trackName} has been closed for participants.`,
    kind: isActive ? "track_opened" : "track_closed",
    level: isActive ? "success" : "warning",
    targetRole: "student",
    trackSlug,
  });
}

export async function insertProblemAvailabilityNotification(
  ctx: any,
  problem: Pick<Doc<"trackProblems">, "trackSlug" | "slug" | "name">,
  isActive: boolean
) {
  const trackName = getTrackLabel(problem.trackSlug);

  return insertNotification(ctx, {
    title: isActive ? `${problem.name} opened` : `${problem.name} closed`,
    message: isActive
      ? `${problem.name} is now available in ${trackName}.`
      : `${problem.name} has been closed in ${trackName}.`,
    kind: isActive ? "problem_opened" : "problem_closed",
    level: isActive ? "success" : "warning",
    targetRole: "student",
    trackSlug: problem.trackSlug,
    problemSlug: problem.slug,
  });
}