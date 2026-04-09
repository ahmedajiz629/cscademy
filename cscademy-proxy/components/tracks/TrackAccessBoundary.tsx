"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { getTrack } from "@/lib/tracks";

function AccessMessage({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-2xl border border-gray-800 bg-[#111127] p-8 text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-gray-500">
          Track Access
        </p>
        <p className="mt-4 text-sm text-gray-300">{message}</p>
      </div>
    </div>
  );
}

export default function TrackAccessBoundary({
  trackId,
  children,
}: {
  trackId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const localTrack = getTrack(trackId);
  const access = useQuery(api.tracks.getAccess, { trackSlug: trackId });
  const reloadedRef = useRef(false);
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!access) {
      return;
    }

    if (!localTrack && access.exists && !reloadedRef.current) {
      reloadedRef.current = true;
      window.location.reload();
      return;
    }

    if ((access.exists === false || access.isVisible === false) && !redirectedRef.current) {
      redirectedRef.current = true;
      router.replace("/tracks");
      router.refresh();
    }
  }, [access, localTrack, router]);

  if (access === undefined) {
    return <AccessMessage message="Checking track availability..." />;
  }

  if (!localTrack && !access.exists) {
    return <AccessMessage message="Waiting for this track to become available..." />;
  }

  if (!localTrack && access.exists) {
    return <AccessMessage message="Track detected. Reloading..." />;
  }

  if (!access.exists || !access.isVisible) {
    return <AccessMessage message="This track is no longer available. Leaving page..." />;
  }

  return <>{children}</>;
}