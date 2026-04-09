import type { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { getConvexClient } from "@/lib/convex-server";
import { getTrack } from "@/lib/tracks";
import type { TrackModule } from "./types";

export interface TrackAccessResult {
  track: TrackModule;
  isVisible: boolean;
}

export async function getTrackAccess(
  convex: ConvexHttpClient,
  trackId: string
): Promise<TrackAccessResult | null> {
  const track = getTrack(trackId);
  if (!track) {
    return null;
  }

  const settings = await convex.query(api.trackSettings.getBySlug, {
    trackSlug: trackId,
  });

  return {
    track,
    isVisible: settings?.isActive ?? track.isActive,
  };
}

export async function getTrackAccessFromServer(trackId: string) {
  return getTrackAccess(getConvexClient(), trackId);
}