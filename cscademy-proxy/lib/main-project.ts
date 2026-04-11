export const MAIN_PROJECT_TRACK_SLUG = "main-project";

export type MainProjectUploadFieldKey =
  | "archive"
  | "presentation"
  | "report"
  | "demoVideo";

export interface MainProjectCustomTextField {
  id: string;
  label: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  multiline?: boolean;
}

export interface MainProjectCustomTextFieldValue {
  fieldId: string;
  value: string;
}

export const MAIN_PROJECT_UPLOAD_FIELDS: Record<
  MainProjectUploadFieldKey,
  {
    label: string;
    accept: string;
    allowedExtensions: string[];
    allowedMimeTypes: string[];
  }
> = {
  archive: {
    label: "Project archive",
    accept: ".zip,application/zip,application/x-zip-compressed",
    allowedExtensions: [".zip"],
    allowedMimeTypes: ["application/zip", "application/x-zip-compressed"],
  },
  presentation: {
    label: "Presentation",
    accept:
      ".pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation",
    allowedExtensions: [".pdf", ".ppt", ".pptx"],
    allowedMimeTypes: [
      "application/pdf",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ],
  },
  report: {
    label: "Report",
    accept: ".pdf,application/pdf",
    allowedExtensions: [".pdf"],
    allowedMimeTypes: ["application/pdf"],
  },
  demoVideo: {
    label: "Demo video",
    accept: ".mp4,video/mp4",
    allowedExtensions: [".mp4"],
    allowedMimeTypes: ["video/mp4"],
  },
};

export type MainProjectDepotStatus =
  | "not-opened"
  | "open"
  | "closed";

export function normalizeOptionalResourceHref(rawValue?: string | null): string {
  const value = rawValue?.trim();

  if (!value) {
    return "";
  }

  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {
    // Fall through to the relative-path normalization below.
  }

  return value.startsWith("/") ? value : `/${value}`;
}

export function isInternalAppHref(rawValue?: string | null): boolean {
  const value = rawValue?.trim();
  return Boolean(value && value.startsWith("/") && !value.startsWith("//"));
}

export function isYouTubeUrl(rawValue?: string | null): boolean {
  const value = rawValue?.trim();

  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      host === "youtu.be" ||
      host === "www.youtube.com" ||
      host === "youtube.com" ||
      host === "m.youtube.com"
    );
  } catch {
    return false;
  }
}

export function isSha256Hex(value?: string | null): boolean {
  return /^[a-f0-9]{64}$/i.test(value?.trim() ?? "");
}

export function slugifyMainProjectFieldId(label: string): string {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "field";
}

export function getMainProjectDepotStatus(
  depotOpensAt?: number,
  depotClosesAt?: number,
  now = Date.now()
): MainProjectDepotStatus {
  if (!depotOpensAt || !depotClosesAt || now < depotOpensAt) {
    return "not-opened";
  }

  if (now > depotClosesAt) {
    return "closed";
  }

  return "open";
}

export function formatMainProjectDate(timestamp?: number | null): string {
  if (!timestamp) {
    return "Not set";
  }

  return new Date(timestamp).toLocaleString();
}

export function fileMatchesMainProjectField(
  fieldKey: MainProjectUploadFieldKey,
  fileName: string,
  mimeType?: string | null
): boolean {
  const field = MAIN_PROJECT_UPLOAD_FIELDS[fieldKey];
  const normalizedName = fileName.trim().toLowerCase();
  const normalizedMime = mimeType?.trim().toLowerCase() ?? "";

  return (
    field.allowedExtensions.some((extension) => normalizedName.endsWith(extension)) ||
    field.allowedMimeTypes.includes(normalizedMime)
  );
}