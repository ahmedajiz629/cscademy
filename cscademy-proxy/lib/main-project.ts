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

export interface MainProjectEvaluationCriterion {
  id: string;
  name: string;
  description?: string;
  coefficient: number;
}

export interface MainProjectEvaluationScoreEntry {
  criterionId: string;
  points: number;
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

export function sumMainProjectEvaluationCoefficients(
  criteria?: MainProjectEvaluationCriterion[] | null
): number {
  return (criteria ?? []).reduce((total, criterion) => {
    const coefficient = Number(criterion.coefficient);
    return total + (Number.isFinite(coefficient) ? coefficient : 0);
  }, 0);
}

export function normalizeMainProjectEvaluationScoreEntries(
  criteria?: MainProjectEvaluationCriterion[] | null,
  scores?: MainProjectEvaluationScoreEntry[] | null
): MainProjectEvaluationScoreEntry[] {
  if (!criteria || criteria.length === 0) {
    return [];
  }

  const scoreByCriterionId = new Map(
    (scores ?? []).map((entry) => [entry.criterionId, entry.points])
  );

  return criteria.flatMap((criterion) => {
    if (!scoreByCriterionId.has(criterion.id)) {
      return [];
    }

    const rawPoints = Number(scoreByCriterionId.get(criterion.id));
    if (!Number.isFinite(rawPoints)) {
      return [];
    }

    return [
      {
        criterionId: criterion.id,
        points: Math.min(criterion.coefficient, Math.max(0, rawPoints)),
      },
    ];
  });
}

export function sumMainProjectEvaluationScores(
  scores?: MainProjectEvaluationScoreEntry[] | null
): number {
  return (scores ?? []).reduce((total, entry) => total + entry.points, 0);
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

export function buildMainProjectSubmissionDownloadHref(
  submissionId: string,
  fieldKey: MainProjectUploadFieldKey
): string {
  const search = new URLSearchParams({
    submissionId,
    fieldKey,
  });

  return `/api/main-project/uploads/download?${search.toString()}`;
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