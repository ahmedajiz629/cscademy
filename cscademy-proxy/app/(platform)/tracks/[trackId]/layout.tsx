import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTrackAccessFromServer } from "@/lib/tracks/access";

export default async function TrackLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ trackId: string }>;
}) {
  const { trackId } = await params;
  const access = await getTrackAccessFromServer(trackId);

  if (!access || !access.isVisible) {
    notFound();
  }

  return children;
}