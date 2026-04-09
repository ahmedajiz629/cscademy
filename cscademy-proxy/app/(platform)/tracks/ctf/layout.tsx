import type { ReactNode } from "react";
import TrackAccessBoundary from "@/components/tracks/TrackAccessBoundary";

export default async function CtfTrackLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <TrackAccessBoundary trackId="ctf">{children}</TrackAccessBoundary>;
}