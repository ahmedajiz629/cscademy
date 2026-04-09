import type { ReactNode } from "react";
import TrackAccessBoundary from "@/components/tracks/TrackAccessBoundary";

export default async function AlgorithmicsTrackLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <TrackAccessBoundary trackId="algorithmics">{children}</TrackAccessBoundary>
  );
}