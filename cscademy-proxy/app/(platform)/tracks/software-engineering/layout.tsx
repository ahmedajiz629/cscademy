import type { ReactNode } from "react";
import TrackAccessBoundary from "@/components/tracks/TrackAccessBoundary";

export default async function SoftwareEngineeringTrackLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <TrackAccessBoundary trackId="software-engineering">
      {children}
    </TrackAccessBoundary>
  );
}