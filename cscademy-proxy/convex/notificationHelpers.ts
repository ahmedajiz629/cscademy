import { getTrack } from "../lib/tracks";
import type { Doc, Id } from "./_generated/dataModel";

const TRACK_LABELS: Record<string, string> = {
  algorithmics: "Algorithmics",
  "software-engineering": "Software Engineering",
  "logic-reverse-engineering": "Logic & Reverse Engineering",
  ctf: "CTF",
  "main-project": "Main Project",
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
    linkUrl,
    linkLabel,
    createdByUserId,
  }: {
    title: string;
    message: string;
    kind:
      | "custom"
      | "track_opened"
      | "track_closed"
      | "problem_opened"
      | "problem_closed"
      | "depot_opened";
    level: "info" | "success" | "warning";
    targetRole?: "student" | "admin" | "all";
    trackSlug?: string;
    problemSlug?: string;
    linkUrl?: string;
    linkLabel?: string;
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
    linkUrl: linkUrl?.trim() || undefined,
    linkLabel: linkLabel?.trim() || undefined,
    createdAt: Date.now(),
    createdByUserId,
  });
}

function getTrackHref(trackSlug: string) {
  return `/tracks/${trackSlug}`;
}

function getProblemHref(trackSlug: string, problemSlug: string) {
  return getTrack(trackSlug)?.buildProblemPath(problemSlug) ?? getTrackHref(trackSlug);
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
    linkUrl: getTrackHref(trackSlug),
    linkLabel: isActive ? "Open track" : undefined,
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
    linkUrl: getProblemHref(problem.trackSlug, problem.slug),
    linkLabel: isActive ? "Open problem" : undefined,
  });
}

export async function insertMainProjectDepotOpenedNotification(
  ctx: any,
  problem: Pick<Doc<"trackProblems">, "trackSlug" | "slug" | "name">,
  closesAt: number
) {
  const trackName = getTrackLabel(problem.trackSlug);

  return insertNotification(ctx, {
    title: `${problem.name} depot is open`,
    message: `The depot for ${problem.name} in ${trackName} is now available. It will close at ${new Date(closesAt).toLocaleString()}.`,
    kind: "depot_opened",
    level: "success",
    targetRole: "student",
    trackSlug: problem.trackSlug,
    problemSlug: problem.slug,
    linkUrl: `${getProblemHref(problem.trackSlug, problem.slug)}#depot`,
    linkLabel: "Open depot",
  });
}