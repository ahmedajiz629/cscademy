import type { TrackModule, TrackProblem } from "./types";
import algorithmics from "./algorithmics";

/** All registered track modules */
const ALL_TRACKS: TrackModule[] = [algorithmics];

/** Map for O(1) lookup */
const trackMap = new Map<string, TrackModule>(
  ALL_TRACKS.map((t) => [t.id, t])
);

/** Get all tracks (optionally only active ones) */
export function getAllTracks(activeOnly = false): TrackModule[] {
  const list = activeOnly
    ? ALL_TRACKS.filter((t) => t.isActive)
    : ALL_TRACKS;
  return list.sort((a, b) => a.order - b.order);
}

/** Get a single track by its slug */
export function getTrack(trackId: string): TrackModule | undefined {
  return trackMap.get(trackId);
}

/** Get a single problem by track + problem slug */
export function getProblem(
  trackId: string,
  problemId: string
): TrackProblem | undefined {
  return trackMap.get(trackId)?.problems.find((p) => p.id === problemId);
}

export type { TrackModule, TrackProblem, Language } from "./types";
