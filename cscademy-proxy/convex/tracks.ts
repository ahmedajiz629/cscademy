import { query } from "./_generated/server";
import { v } from "convex/values";
import { getTrack } from "../lib/tracks";

export const getAccess = query({
  args: { trackSlug: v.string() },
  handler: async (ctx, { trackSlug }) => {
    const track = getTrack(trackSlug);

    if (!track) {
      return {
        exists: false,
        isVisible: false,
      };
    }

    const settings = await ctx.db
      .query("trackSettings")
      .withIndex("by_trackSlug", (q) => q.eq("trackSlug", trackSlug))
      .first();

    return {
      exists: true,
      isVisible: settings?.isActive ?? track.isActive,
    };
  },
});