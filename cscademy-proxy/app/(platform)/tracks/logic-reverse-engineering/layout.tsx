import type { ReactNode } from "react";
import TrackAccessBoundary from "@/components/tracks/TrackAccessBoundary";

export default async function LogicReverseEngineeringTrackLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <TrackAccessBoundary trackId="logic-reverse-engineering">
      {children}
    </TrackAccessBoundary>
  );
}