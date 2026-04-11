import type { ReactNode } from "react";
import TrackAccessBoundary from "@/components/tracks/TrackAccessBoundary";

export default async function MainProjectTrackLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <TrackAccessBoundary trackId="main-project">{children}</TrackAccessBoundary>;
}