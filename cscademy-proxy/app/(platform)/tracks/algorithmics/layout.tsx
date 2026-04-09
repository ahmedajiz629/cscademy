import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTrackAccessFromServer } from "@/lib/tracks/access";

export default async function AlgorithmicsTrackLayout({
  children,
}: {
  children: ReactNode;
}) {
  const access = await getTrackAccessFromServer("algorithmics");

  if (!access || !access.isVisible) {
    notFound();
  }

  return children;
}