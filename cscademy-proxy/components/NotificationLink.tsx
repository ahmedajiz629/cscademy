"use client";

import Link from "next/link";
import { isInternalAppHref } from "@/lib/main-project";

export default function NotificationLink({
  href,
  label,
  className,
}: {
  href?: string | null;
  label?: string | null;
  className?: string;
}) {
  const normalizedHref = href?.trim();

  if (!normalizedHref) {
    return null;
  }

  const text = label?.trim() || normalizedHref;

  if (isInternalAppHref(normalizedHref)) {
    return (
      <Link href={normalizedHref} className={className}>
        {text}
      </Link>
    );
  }

  return (
    <a href={normalizedHref} target="_blank" rel="noreferrer" className={className}>
      {text}
    </a>
  );
}