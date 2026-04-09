import type { ReactNode } from "react";
import TrackAccessBoundary from "@/components/tracks/TrackAccessBoundary";

export default async function TrackLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ trackId: string }>;
}) {
  const { trackId } = await params;

  return <TrackAccessBoundary trackId={trackId}>{children}</TrackAccessBoundary>;
}