"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  MAIN_PROJECT_UPLOAD_FIELDS,
  buildMainProjectSubmissionDownloadHref,
  fileMatchesMainProjectField,
  formatMainProjectDate,
  getMainProjectDepotStatus,
  isYouTubeUrl,
  normalizeOptionalResourceHref,
  type MainProjectCustomTextField,
  type MainProjectCustomTextFieldValue,
  type MainProjectUploadFieldKey,
} from "@/lib/main-project";
import MarkdownContent from "@/components/MarkdownContent";
import { formatScore } from "@/lib/score-format";
import track from "@/lib/tracks/main-project";

const REQUIRED_UPLOAD_FIELDS: MainProjectUploadFieldKey[] = [
  "archive",
  "presentation",
  "report",
];
const REGISTERABLE_UPLOAD_FIELDS: MainProjectUploadFieldKey[] = [
  ...REQUIRED_UPLOAD_FIELDS,
  "demoVideo",
];

type Notice = {
  text: string;
  tone: "error" | "info" | "success";
};

type RegisteredUploadRecord = {
  _id: Id<"mainProjectUploadRegistrations">;
  allowed: boolean;
  closesAt: number | null;
  createdAt: number;
  fieldKey: MainProjectUploadFieldKey;
  fileName: string;
  fileSize: number | null;
  mimeType: string | null;
  sha256: string;
};

type SubmissionRecord = {
  _id: Id<"mainProjectSubmissions">;
  archiveHash: string;
  archiveUrl: string;
  customFieldValues: MainProjectCustomTextFieldValue[];
  demoHash?: string;
  demoType: "upload" | "youtube";
  demoUrl: string;
  presentationHash: string;
  presentationUrl: string;
  reportHash: string;
  reportUrl: string;
  updatedAt: number;
};

type FieldValidationState = {
  message?: string;
  sha256?: string;
  status: "error" | "idle" | "ok" | "pending";
  validatedUrl?: string;
};

function createEmptyValidationState(): FieldValidationState {
  return { status: "idle" };
}

function createInitialValidationStateRecord(): Record<
  MainProjectUploadFieldKey,
  FieldValidationState
> {
  return {
    archive: createEmptyValidationState(),
    demoVideo: createEmptyValidationState(),
    presentation: createEmptyValidationState(),
    report: createEmptyValidationState(),
  };
}

function formatBytes(fileSize?: number | null) {
  if (!fileSize || fileSize <= 0) {
    return "Unknown size";
  }

  if (fileSize < 1024) {
    return `${fileSize} B`;
  }

  if (fileSize < 1024 * 1024) {
    return `${(fileSize / 1024).toFixed(1)} KB`;
  }

  if (fileSize < 1024 * 1024 * 1024) {
    return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${(fileSize / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function shortenHash(hash?: string | null) {
  const trimmed = hash?.trim();

  if (!trimmed) {
    return "Not registered yet";
  }

  return `${trimmed.slice(0, 12)}...${trimmed.slice(-8)}`;
}

function getSubmissionHashForField(
  submission: SubmissionRecord | null | undefined,
  fieldKey: MainProjectUploadFieldKey
) {
  if (!submission) {
    return "";
  }

  if (fieldKey === "archive") {
    return submission.archiveHash;
  }

  if (fieldKey === "presentation") {
    return submission.presentationHash;
  }

  if (fieldKey === "report") {
    return submission.reportHash;
  }

  return submission.demoType === "upload" ? submission.demoHash ?? "" : "";
}

function getSubmissionUrlForField(
  submission: SubmissionRecord | null | undefined,
  fieldKey: MainProjectUploadFieldKey
) {
  if (!submission) {
    return "";
  }

  if (fieldKey === "archive") {
    return submission.archiveUrl;
  }

  if (fieldKey === "presentation") {
    return submission.presentationUrl;
  }

  if (fieldKey === "report") {
    return submission.reportUrl;
  }

  return submission.demoUrl;
}

function createValidationStateFromSubmission(
  submission: SubmissionRecord | null | undefined,
  fieldKey: MainProjectUploadFieldKey
): FieldValidationState {
  const sha256 = getSubmissionHashForField(submission, fieldKey);
  const validatedUrl = getSubmissionUrlForField(submission, fieldKey).trim();

  if (!submission || !sha256 || !validatedUrl) {
    return createEmptyValidationState();
  }

  return {
    message: "Using the last verified submission link.",
    sha256,
    status: "ok",
    validatedUrl,
  };
}

async function computeFileSha256(file: File) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("This browser cannot calculate SHA-256 hashes.");
  }

  const buffer = await file.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);

  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function triggerRegisteredFileDownload(file: File) {
  const objectUrl = URL.createObjectURL(file);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1000);
}

function getUserFacingErrorMessage(error: unknown, fallback: string) {
  const rawMessage =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "").trim()
      : "";

  if (!rawMessage) {
    return fallback;
  }

  const compactMessage = rawMessage.replace(/\s+/g, " ").trim();
  const uncaughtErrorMarker = "Uncaught Error:";
  const uncaughtErrorIndex = compactMessage.lastIndexOf(uncaughtErrorMarker);

  let candidate =
    uncaughtErrorIndex >= 0
      ? compactMessage.slice(uncaughtErrorIndex + uncaughtErrorMarker.length).trim()
      : compactMessage;

  const stackTraceIndex = candidate.search(/\s+at\s+[^\s]+/i);

  if (stackTraceIndex > 0) {
    candidate = candidate.slice(0, stackTraceIndex).trim();
  }

  candidate = candidate.replace(/\s+Called by client$/i, "").trim();

  if (candidate === "The depot is not currently open for uploads.") {
    return "The depot is not currently open for file registration.";
  }

  return candidate || fallback;
}

export default function MainProjectProblemPage() {
  const params = useParams();
  const problemId = params.problemId as string;
  const registerUpload = useMutation(api.mainProjectSubmissions.registerUpload);

  const problem = useQuery(api.trackProblems.getBySlug, {
    trackSlug: track.id,
    slug: problemId,
  });
  const scoreRecord = useQuery(api.scores.getMineByProblem, {
    trackSlug: track.id,
    problemSlug: problemId,
  });
  const submission = useQuery(api.mainProjectSubmissions.getMineByProblem, {
    problemSlug: problemId,
  }) as SubmissionRecord | null | undefined;
  const registeredUploads = useQuery(
    api.mainProjectSubmissions.listMineRegisteredUploadsByProblem,
    {
      problemSlug: problemId,
    }
  ) as RegisteredUploadRecord[] | undefined;

  const fileInputRefs = useRef<Record<MainProjectUploadFieldKey, HTMLInputElement | null>>({
    archive: null,
    demoVideo: null,
    presentation: null,
    report: null,
  });

  const [notice, setNotice] = useState<Notice | null>(null);
  const [demoType, setDemoType] = useState<"upload" | "youtube">("youtube");
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [selectedHashes, setSelectedHashes] = useState<
    Partial<Record<MainProjectUploadFieldKey, string>>
  >({});
  const [linkInputs, setLinkInputs] = useState<
    Partial<Record<MainProjectUploadFieldKey, string>>
  >({});
  const [validationByField, setValidationByField] = useState<
    Record<MainProjectUploadFieldKey, FieldValidationState>
  >(createInitialValidationStateRecord);
  const [pendingRegistrationField, setPendingRegistrationField] =
    useState<MainProjectUploadFieldKey | null>(null);
  const [pendingValidationField, setPendingValidationField] =
    useState<MainProjectUploadFieldKey | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const bestScore = scoreRecord?.score ?? null;
  const registrations = registeredUploads ?? [];
  const allowedRegistrations = registrations.filter((entry) => entry.allowed);
  const registrationsByField: Record<
    MainProjectUploadFieldKey,
    RegisteredUploadRecord[]
  > = {
    archive: [],
    demoVideo: [],
    presentation: [],
    report: [],
  };

  for (const entry of allowedRegistrations) {
    registrationsByField[entry.fieldKey].push(entry);
  }

  useEffect(() => {
    setNotice(null);
  }, [problemId]);

  useEffect(() => {
    if (!problem) {
      return;
    }

    const nextCustomFieldValues: Record<string, string> = {};

    for (const field of (problem.customTextFields ?? []) as MainProjectCustomTextField[]) {
      nextCustomFieldValues[field.id] = "";
    }

    for (const entry of submission?.customFieldValues ?? []) {
      nextCustomFieldValues[entry.fieldId] = entry.value;
    }

    setCustomFieldValues(nextCustomFieldValues);
    setDemoType(submission?.demoType === "upload" ? "upload" : "youtube");
    setLinkInputs({
      archive: submission?.archiveUrl ?? "",
      demoVideo: submission?.demoUrl ?? "",
      presentation: submission?.presentationUrl ?? "",
      report: submission?.reportUrl ?? "",
    });
    setValidationByField({
      archive: createValidationStateFromSubmission(submission, "archive"),
      demoVideo:
        submission?.demoType === "upload"
          ? createValidationStateFromSubmission(submission, "demoVideo")
          : createEmptyValidationState(),
      presentation: createValidationStateFromSubmission(submission, "presentation"),
      report: createValidationStateFromSubmission(submission, "report"),
    });
  }, [problem?._id, submission?._id, submission?.updatedAt]);

  useEffect(() => {
    setSelectedHashes((current) => {
      const next = { ...current };

      for (const fieldKey of REGISTERABLE_UPLOAD_FIELDS) {
        const options = registrationsByField[fieldKey];
        const currentHash = current[fieldKey]?.trim();

        if (currentHash && options.some((option) => option.sha256 === currentHash)) {
          next[fieldKey] = currentHash;
          continue;
        }

        const submittedHash = getSubmissionHashForField(submission, fieldKey);

        if (submittedHash && options.some((option) => option.sha256 === submittedHash)) {
          next[fieldKey] = submittedHash;
          continue;
        }

        next[fieldKey] = options[0]?.sha256 ?? "";
      }

      return next;
    });
  }, [
    registeredUploads,
    submission?.archiveHash,
    submission?.demoHash,
    submission?.presentationHash,
    submission?.reportHash,
  ]);

  if (
    problem === undefined ||
    registeredUploads === undefined ||
    scoreRecord === undefined ||
    submission === undefined
  ) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!problem) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0a]">
        <div className="text-gray-400">Problem not found.</div>
      </div>
    );
  }

  const depotStatus = getMainProjectDepotStatus(
    problem.depotOpensAt,
    problem.depotClosesAt
  );
  const isDepotOpen = depotStatus === "open";
  const isDepotClosed = depotStatus === "closed";
  const hasRegisteredUploads = allowedRegistrations.length > 0;
  const showRegistrationPanel = isDepotOpen || hasRegisteredUploads;
  const briefHref = normalizeOptionalResourceHref(problem.briefDownloadUrl);
  const customTextFields = (problem.customTextFields ?? []) as MainProjectCustomTextField[];

  const currentSubmissionFiles = submission
    ? [
        {
          href: buildMainProjectSubmissionDownloadHref(submission._id, "archive"),
          label: MAIN_PROJECT_UPLOAD_FIELDS.archive.label,
          note: shortenHash(submission.archiveHash),
        },
        {
          href: buildMainProjectSubmissionDownloadHref(submission._id, "presentation"),
          label: MAIN_PROJECT_UPLOAD_FIELDS.presentation.label,
          note: shortenHash(submission.presentationHash),
        },
        {
          href: buildMainProjectSubmissionDownloadHref(submission._id, "report"),
          label: MAIN_PROJECT_UPLOAD_FIELDS.report.label,
          note: shortenHash(submission.reportHash),
        },
        submission.demoType === "upload"
          ? {
              href: buildMainProjectSubmissionDownloadHref(submission._id, "demoVideo"),
              label: MAIN_PROJECT_UPLOAD_FIELDS.demoVideo.label,
              note: shortenHash(submission.demoHash),
            }
          : {
              external: true,
              href: normalizeOptionalResourceHref(submission.demoUrl),
              label: "Demo link",
              note: "YouTube",
            },
      ]
    : [];

  function openFilePicker(fieldKey: MainProjectUploadFieldKey) {
    if (!isDepotOpen || pendingRegistrationField) {
      return;
    }

    fileInputRefs.current[fieldKey]?.click();
  }

  function applySelectedRegistration(
    fieldKey: MainProjectUploadFieldKey,
    sha256: string
  ) {
    const normalizedHash = sha256.trim().toLowerCase();
    const submittedHash = getSubmissionHashForField(submission, fieldKey);
    const submittedUrl = getSubmissionUrlForField(submission, fieldKey);

    setSelectedHashes((current) => ({
      ...current,
      [fieldKey]: normalizedHash,
    }));

    if (submittedHash && normalizedHash === submittedHash && submittedUrl) {
      setLinkInputs((current) => ({
        ...current,
        [fieldKey]: submittedUrl,
      }));
      setValidationByField((current) => ({
        ...current,
        [fieldKey]: createValidationStateFromSubmission(submission, fieldKey),
      }));
      return;
    }

    setLinkInputs((current) => ({
      ...current,
      [fieldKey]: "",
    }));
    setValidationByField((current) => ({
      ...current,
      [fieldKey]: createEmptyValidationState(),
    }));
  }

  function updateLinkInput(fieldKey: MainProjectUploadFieldKey, value: string) {
    setLinkInputs((current) => ({
      ...current,
      [fieldKey]: value,
    }));
    setValidationByField((current) => {
      const state = current[fieldKey];

      if (
        state.status === "ok" &&
        state.validatedUrl === value.trim() &&
        state.sha256 === selectedHashes[fieldKey]?.trim().toLowerCase()
      ) {
        return current;
      }

      return {
        ...current,
        [fieldKey]: createEmptyValidationState(),
      };
    });
  }

  async function handleFileSelection(
    fieldKey: MainProjectUploadFieldKey,
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";

    if (!file) {
      return;
    }

    if (!isDepotOpen) {
      setNotice({
        text: "The depot is not currently open for file registration.",
        tone: "error",
      });
      return;
    }

    if (!fileMatchesMainProjectField(fieldKey, file.name, file.type)) {
      setNotice({
        text: `${MAIN_PROJECT_UPLOAD_FIELDS[fieldKey].label} must match ${MAIN_PROJECT_UPLOAD_FIELDS[fieldKey].allowedExtensions.join(", ")}.`,
        tone: "error",
      });
      return;
    }

    setPendingRegistrationField(fieldKey);

    try {
      const sha256 = await computeFileSha256(file);

      await registerUpload({
        fieldKey,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type || undefined,
        problemSlug: problemId,
        sha256,
      });

      if (fieldKey === "demoVideo") {
        setDemoType("upload");
      }

      applySelectedRegistration(fieldKey, sha256);
      triggerRegisteredFileDownload(file);
      setNotice({
        text: `${file.name} was registered successfully. A local copy has been downloaded so you can upload this exact file to your public host after the depot closes.`,
        tone: "success",
      });
    } catch (error: any) {
      setNotice({
        text: getUserFacingErrorMessage(
          error,
          "Failed to register the selected file."
        ),
        tone: "error",
      });
    } finally {
      setPendingRegistrationField(null);
    }
  }

  async function validateUploadedLink(fieldKey: MainProjectUploadFieldKey) {
    const selectedHash = selectedHashes[fieldKey]?.trim().toLowerCase();
    const fileUrl = linkInputs[fieldKey]?.trim() ?? "";
    const selectedRegistration = registrationsByField[fieldKey].find(
      (entry) => entry.sha256 === selectedHash
    );

    if (!isDepotClosed) {
      setNotice({
        text: "Public links can only be validated after the depot closes.",
        tone: "error",
      });
      return;
    }

    if (!selectedHash || !selectedRegistration) {
      setNotice({
        text: `Select a registered ${MAIN_PROJECT_UPLOAD_FIELDS[fieldKey].label.toLowerCase()} first.`,
        tone: "error",
      });
      return;
    }

    if (!fileUrl) {
      setNotice({
        text: "Enter the public URL that hosts the registered file.",
        tone: "error",
      });
      return;
    }

    setPendingValidationField(fieldKey);
    setValidationByField((current) => ({
      ...current,
      [fieldKey]: {
        message: "Validating the public link against the registered hash...",
        sha256: selectedHash,
        status: "pending",
      },
    }));

    try {
      const response = await fetch("/api/main-project/uploads/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fieldKey,
          fileUrl,
          problemSlug: problemId,
          sha256: selectedHash,
        }),
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "The public file URL could not be validated.");
      }

      setLinkInputs((current) => ({
        ...current,
        [fieldKey]: data.url,
      }));
      setValidationByField((current) => ({
        ...current,
        [fieldKey]: {
          message: `Validated ${selectedRegistration.fileName} (${formatBytes(data.fileSize)}) against the registered hash.`,
          sha256: data.sha256,
          status: "ok",
          validatedUrl: data.url,
        },
      }));
      setNotice({
        text: `${MAIN_PROJECT_UPLOAD_FIELDS[fieldKey].label} link verified successfully.`,
        tone: "success",
      });
    } catch (error: any) {
      const message = getUserFacingErrorMessage(
        error,
        "The public file URL could not be validated."
      );

      setValidationByField((current) => ({
        ...current,
        [fieldKey]: {
          message,
          sha256: selectedHash,
          status: "error",
        },
      }));
      setNotice({
        text: message,
        tone: "error",
      });
    } finally {
      setPendingValidationField(null);
    }
  }

  async function submitFinalLinks() {
    setIsSubmitting(true);

    try {
      if (!isDepotClosed) {
        throw new Error("Final file URLs can only be submitted after the depot closes.");
      }

      for (const field of customTextFields) {
        if (field.required && !customFieldValues[field.id]?.trim()) {
          throw new Error(`The field \"${field.label}\" is required.`);
        }
      }

      const archiveHash = selectedHashes.archive?.trim().toLowerCase();
      const presentationHash = selectedHashes.presentation?.trim().toLowerCase();
      const reportHash = selectedHashes.report?.trim().toLowerCase();

      if (!archiveHash || !presentationHash || !reportHash) {
        throw new Error("Select registered files for the archive, presentation, and report.");
      }

      for (const fieldKey of REQUIRED_UPLOAD_FIELDS) {
        const validation = validationByField[fieldKey];
        const selectedHash = selectedHashes[fieldKey]?.trim().toLowerCase();

        if (
          validation.status !== "ok" ||
          !validation.validatedUrl ||
          !selectedHash ||
          validation.sha256 !== selectedHash
        ) {
          throw new Error(
            `${MAIN_PROJECT_UPLOAD_FIELDS[fieldKey].label} must be validated against the registered file before submission.`
          );
        }
      }

      let nextDemoUrl = linkInputs.demoVideo?.trim() ?? "";
      let nextDemoHash: string | undefined;

      if (demoType === "upload") {
        const selectedDemoHash = selectedHashes.demoVideo?.trim().toLowerCase();
        const validation = validationByField.demoVideo;

        if (
          validation.status !== "ok" ||
          !validation.validatedUrl ||
          !selectedDemoHash ||
          validation.sha256 !== selectedDemoHash
        ) {
          throw new Error(
            `${MAIN_PROJECT_UPLOAD_FIELDS.demoVideo.label} must be validated against the registered file before submission.`
          );
        }

        nextDemoHash = selectedDemoHash;
        nextDemoUrl = validation.validatedUrl;
      } else if (!isYouTubeUrl(nextDemoUrl)) {
        throw new Error("Enter a valid YouTube URL for the demo link.");
      }

      const response = await fetch(track.submitEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          archiveHash,
          archiveUrl: validationByField.archive.validatedUrl,
          customFieldValues: customTextFields.map((field) => ({
            fieldId: field.id,
            value: customFieldValues[field.id] ?? "",
          })),
          demoHash: nextDemoHash,
          demoType,
          demoUrl: nextDemoUrl,
          presentationHash,
          presentationUrl: validationByField.presentation.validatedUrl,
          problemSlug: problemId,
          reportHash,
          reportUrl: validationByField.report.validatedUrl,
          trackSlug: track.id,
        }),
      });
      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || "The final main-project submission failed.");
      }

      setNotice({
        text: "Submission saved. Every stored link was re-verified against your registered hashes.",
        tone: "success",
      });
    } catch (error: any) {
      setNotice({
        text: getUserFacingErrorMessage(
          error,
          "The final main-project submission failed."
        ),
        tone: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link
          href="/tracks/main-project"
          className="text-sm text-gray-400 transition-colors hover:text-white"
        >
          ← Back to Main Project
        </Link>
      </div>

      <div className="space-y-6">
        <section className="rounded-3xl border border-gray-800 bg-[linear-gradient(135deg,rgba(15,23,42,0.95),rgba(17,24,39,0.78))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-3xl">
              <p className="mb-2 text-xs uppercase tracking-[0.24em] text-cyan-300">
                Main Project Depot
              </p>
              <h1 className="text-3xl font-bold text-white">{problem.name}</h1>
              <MarkdownContent
                className="mt-3 max-w-2xl"
                content={problem.description}
              />
              {briefHref ? (
                <div className="mt-5 rounded-2xl border border-cyan-500/25 bg-cyan-500/10 p-4 shadow-[0_12px_32px_rgba(6,182,212,0.08)]">
                  <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">
                    Project Brief
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <a
                      href={briefHref}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-xl border border-cyan-400/40 bg-cyan-400/15 px-4 py-2 text-sm font-semibold text-cyan-50 transition-colors hover:border-cyan-300/70 hover:bg-cyan-400/25"
                    >
                      Open Brief
                    </a>
                    <p className="min-w-0 flex-1 break-all text-xs text-cyan-50/85">
                      {briefHref}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="min-w-[220px] rounded-2xl border border-cyan-400/25 bg-cyan-400/10 p-4">
              <p className="text-xs uppercase tracking-wide text-cyan-200">
                Current Phase
              </p>
              <div className="mt-2 flex items-center gap-3">
                <StatusPill status={depotStatus} />
                <p className="text-sm text-cyan-50">
                  {depotStatus === "open"
                    ? "Register exact files now."
                    : depotStatus === "closed"
                      ? "Submit public links now."
                      : "Waiting for the depot window."}
                </p>
              </div>
            </div>
          </div>

          {notice && (
            <div
              className={`mt-6 rounded-2xl border px-4 py-3 text-sm ${
                notice.tone === "success"
                  ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-100"
                  : notice.tone === "error"
                    ? "border-red-500/35 bg-red-500/10 text-red-100"
                    : "border-cyan-500/35 bg-cyan-500/10 text-cyan-100"
              }`}
            >
              {notice.text}
            </div>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <InfoCard
            label="Best Score"
            value={bestScore !== null ? formatScore(bestScore) : "—"}
            hint={`/${problem.points}`}
          />
          <InfoCard
            label="Depot Opens"
            value={formatMainProjectDate(problem.depotOpensAt)}
          />
          <InfoCard
            label="Depot Closes"
            value={formatMainProjectDate(problem.depotClosesAt)}
          />
        </section>

        <section className="rounded-2xl border border-gray-800 bg-[#111127] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-400">
                Step 1
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Register Exact Files
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-gray-400">
                Choose the final archive, presentation, report, and optional MP4 demo while the depot is open. The browser hashes each file, the platform stores its name, size, and SHA-256, then a local copy downloads automatically so you can publish the exact artifact later.
              </p>
            </div>
            <StatusPill status={isDepotOpen ? "open" : depotStatus === "closed" ? "closed" : "not-opened"} />
          </div>

          {showRegistrationPanel ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {REGISTERABLE_UPLOAD_FIELDS.map((fieldKey) => {
                const field = MAIN_PROJECT_UPLOAD_FIELDS[fieldKey];
                const fieldRegistrations = registrationsByField[fieldKey];
                const selectedRegistration = fieldRegistrations.find(
                  (entry) => entry.sha256 === selectedHashes[fieldKey]?.trim().toLowerCase()
                );

                return (
                  <div
                    key={fieldKey}
                    className="rounded-2xl border border-gray-800 bg-[#0c0c1d] p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{field.label}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          Accepted: {field.allowedExtensions.join(", ")}
                        </p>
                      </div>
                      {isDepotOpen ? (
                        <>
                          <button
                            type="button"
                            onClick={() => openFilePicker(fieldKey)}
                            disabled={pendingRegistrationField !== null}
                            className="rounded-xl border border-cyan-500/35 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition-colors hover:border-cyan-400/60 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500"
                          >
                            {pendingRegistrationField === fieldKey
                              ? "Hashing..."
                              : "Choose File"}
                          </button>
                          <input
                            ref={(element) => {
                              fileInputRefs.current[fieldKey] = element;
                            }}
                            type="file"
                            accept={field.accept}
                            className="hidden"
                            onChange={(event) => {
                              void handleFileSelection(fieldKey, event);
                            }}
                          />
                        </>
                      ) : (
                        <span className="rounded-full border border-gray-700 bg-[#10182d] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                          {isDepotClosed ? "Registration Closed" : "Registration Unavailable"}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 rounded-xl border border-gray-800 bg-[#0a1020] p-4 text-sm text-gray-300">
                      {selectedRegistration ? (
                        <>
                          <p className="font-medium text-white">{selectedRegistration.fileName}</p>
                          <p className="mt-1 text-xs text-gray-400">
                            {formatBytes(selectedRegistration.fileSize)} • {shortenHash(selectedRegistration.sha256)}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            Registered {formatMainProjectDate(selectedRegistration.createdAt)}
                          </p>
                        </>
                      ) : (
                        <p className="text-gray-500">
                          No registered file selected yet.
                        </p>
                      )}
                    </div>

                    {fieldRegistrations.length > 0 ? (
                      <div className="mt-4 space-y-2">
                        {fieldRegistrations.map((entry) => {
                          const isSelected =
                            selectedHashes[fieldKey]?.trim().toLowerCase() === entry.sha256;

                          return (
                            <button
                              key={String(entry._id)}
                              type="button"
                              onClick={() => applySelectedRegistration(fieldKey, entry.sha256)}
                              className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                                isSelected
                                  ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-50"
                                  : "border-gray-800 bg-[#0a1020] text-gray-300 hover:border-gray-700 hover:bg-[#10182d]"
                              }`}
                            >
                              <div>
                                <p className="text-sm font-medium">{entry.fileName}</p>
                                <p className="mt-1 text-xs text-gray-500">
                                  {formatBytes(entry.fileSize)} • {shortenHash(entry.sha256)}
                                </p>
                              </div>
                              <span className="text-xs text-gray-500">
                                {formatMainProjectDate(entry.createdAt)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-4 text-xs text-gray-500">
                        {isDepotClosed
                          ? "No allowed registration was saved before the depot closed."
                          : "No file has been registered yet for this slot."}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-gray-800 bg-[#0c0c1d] p-5 text-sm text-gray-400">
              File registration will appear here when the depot opens.
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-800 bg-[#111127] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-400">
                Step 2
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Submit Public Links
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-gray-400">
                After the depot closes, upload the exact registered files to any public host, then validate each URL here. The backend fetches the file, checks it locally against the registered hash, and only then accepts the final submission.
              </p>
            </div>
            <StatusPill status={isDepotClosed ? "closed" : depotStatus} />
          </div>

          {isDepotClosed ? (
            <>
              <div className="mt-6 rounded-2xl border border-gray-800 bg-[#0c0c1d] p-4">
                <p className="text-sm font-semibold text-white">Demo Delivery</p>
                <p className="mt-2 text-sm text-gray-400">
                  Use a YouTube link, or keep the demo as an MP4 and validate it like the other files.
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setDemoType("youtube")}
                    className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                      demoType === "youtube"
                        ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-50"
                        : "border-gray-800 bg-[#111127] text-gray-400 hover:text-white"
                    }`}
                  >
                    YouTube Link
                  </button>
                  <button
                    type="button"
                    onClick={() => setDemoType("upload")}
                    className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                      demoType === "upload"
                        ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-50"
                        : "border-gray-800 bg-[#111127] text-gray-400 hover:text-white"
                    }`}
                  >
                    MP4 Upload Link
                  </button>
                </div>
              </div>

              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {REQUIRED_UPLOAD_FIELDS.map((fieldKey) => {
                  const field = MAIN_PROJECT_UPLOAD_FIELDS[fieldKey];
                  const selectedRegistration = registrationsByField[fieldKey].find(
                    (entry) => entry.sha256 === selectedHashes[fieldKey]?.trim().toLowerCase()
                  );
                  const validation = validationByField[fieldKey];

                  return (
                    <div
                      key={fieldKey}
                      className="rounded-2xl border border-gray-800 bg-[#0c0c1d] p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{field.label}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            Selected hash: {shortenHash(selectedHashes[fieldKey])}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            void validateUploadedLink(fieldKey);
                          }}
                          disabled={!selectedRegistration || pendingValidationField !== null}
                          className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition-colors hover:border-emerald-400/60 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500"
                        >
                          {pendingValidationField === fieldKey
                            ? "Validating..."
                            : "Validate Link"}
                        </button>
                      </div>

                      <div className="mt-4 rounded-xl border border-gray-800 bg-[#0a1020] p-4 text-sm text-gray-300">
                        {selectedRegistration ? (
                          <>
                            <p className="font-medium text-white">{selectedRegistration.fileName}</p>
                            <p className="mt-1 text-xs text-gray-400">
                              {formatBytes(selectedRegistration.fileSize)} • {shortenHash(selectedRegistration.sha256)}
                            </p>
                          </>
                        ) : (
                          <p className="text-gray-500">
                            Register this file while the depot is open before you can submit a public link.
                          </p>
                        )}
                      </div>

                      <Field label="Public File URL">
                        <input
                          value={linkInputs[fieldKey] ?? ""}
                          onChange={(event) => updateLinkInput(fieldKey, event.target.value)}
                          disabled={!selectedRegistration}
                          placeholder="https://example.com/path/to/file"
                          className="w-full rounded-xl border border-gray-700 bg-[#111127] px-4 py-3 text-sm text-white focus:border-cyan-500 focus:outline-none disabled:cursor-not-allowed disabled:border-gray-800 disabled:bg-[#0b0f1d] disabled:text-gray-500"
                        />
                      </Field>

                      <ValidationMessage validation={validation} />
                    </div>
                  );
                })}

                <div className="rounded-2xl border border-gray-800 bg-[#0c0c1d] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Demo</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {demoType === "upload"
                          ? `Selected hash: ${shortenHash(selectedHashes.demoVideo)}`
                          : "Provide the public YouTube URL for your demo."}
                      </p>
                    </div>
                    {demoType === "upload" && (
                      <button
                        type="button"
                        onClick={() => {
                          void validateUploadedLink("demoVideo");
                        }}
                        disabled={
                          !registrationsByField.demoVideo.find(
                            (entry) =>
                              entry.sha256 === selectedHashes.demoVideo?.trim().toLowerCase()
                          ) || pendingValidationField !== null
                        }
                        className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition-colors hover:border-emerald-400/60 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500"
                      >
                        {pendingValidationField === "demoVideo"
                          ? "Validating..."
                          : "Validate Link"}
                      </button>
                    )}
                  </div>

                  {demoType === "upload" ? (
                    <>
                      <div className="mt-4 rounded-xl border border-gray-800 bg-[#0a1020] p-4 text-sm text-gray-300">
                        {registrationsByField.demoVideo.find(
                          (entry) =>
                            entry.sha256 === selectedHashes.demoVideo?.trim().toLowerCase()
                        ) ? (
                          (() => {
                            const selectedRegistration = registrationsByField.demoVideo.find(
                              (entry) =>
                                entry.sha256 ===
                                selectedHashes.demoVideo?.trim().toLowerCase()
                            );

                            if (!selectedRegistration) {
                              return null;
                            }

                            return (
                              <>
                                <p className="font-medium text-white">
                                  {selectedRegistration.fileName}
                                </p>
                                <p className="mt-1 text-xs text-gray-400">
                                  {formatBytes(selectedRegistration.fileSize)} • {shortenHash(selectedRegistration.sha256)}
                                </p>
                              </>
                            );
                          })()
                        ) : (
                          <p className="text-gray-500">
                            Register the demo MP4 while the depot is open before validating its public link.
                          </p>
                        )}
                      </div>

                      <Field label="Public Demo File URL">
                        <input
                          value={linkInputs.demoVideo ?? ""}
                          onChange={(event) => updateLinkInput("demoVideo", event.target.value)}
                          disabled={
                            !registrationsByField.demoVideo.find(
                              (entry) =>
                                entry.sha256 === selectedHashes.demoVideo?.trim().toLowerCase()
                            )
                          }
                          placeholder="https://example.com/path/to/demo.mp4"
                          className="w-full rounded-xl border border-gray-700 bg-[#111127] px-4 py-3 text-sm text-white focus:border-cyan-500 focus:outline-none disabled:cursor-not-allowed disabled:border-gray-800 disabled:bg-[#0b0f1d] disabled:text-gray-500"
                        />
                      </Field>

                      <ValidationMessage validation={validationByField.demoVideo} />
                    </>
                  ) : (
                    <>
                      <Field label="YouTube URL">
                        <input
                          value={linkInputs.demoVideo ?? ""}
                          onChange={(event) => updateLinkInput("demoVideo", event.target.value)}
                          placeholder="https://www.youtube.com/watch?v=..."
                          className="w-full rounded-xl border border-gray-700 bg-[#111127] px-4 py-3 text-sm text-white focus:border-cyan-500 focus:outline-none"
                        />
                      </Field>
                      <p
                        className={`text-xs ${
                          !linkInputs.demoVideo?.trim()
                            ? "text-gray-500"
                            : isYouTubeUrl(linkInputs.demoVideo)
                              ? "text-emerald-300"
                              : "text-amber-300"
                        }`}
                      >
                        {!linkInputs.demoVideo?.trim()
                          ? "Add the public YouTube URL after the depot closes."
                          : isYouTubeUrl(linkInputs.demoVideo)
                            ? "This looks like a valid YouTube URL."
                            : "The final demo link must point to YouTube."}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {customTextFields.length > 0 && (
                <div className="mt-6 rounded-2xl border border-gray-800 bg-[#0c0c1d] p-5">
                  <h3 className="text-lg font-semibold text-white">Required Inputs</h3>
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    {customTextFields.map((field) => {
                      const value = customFieldValues[field.id] ?? "";

                      return (
                        <Field
                          key={field.id}
                          label={`${field.label}${field.required ? " *" : ""}`}
                        >
                          {field.multiline ? (
                            <textarea
                              value={value}
                              rows={5}
                              onChange={(event) => {
                                setCustomFieldValues((current) => ({
                                  ...current,
                                  [field.id]: event.target.value,
                                }));
                              }}
                              placeholder={field.placeholder || "Enter your response"}
                              className="w-full rounded-xl border border-gray-700 bg-[#111127] px-4 py-3 text-sm text-white focus:border-cyan-500 focus:outline-none"
                            />
                          ) : (
                            <input
                              value={value}
                              onChange={(event) => {
                                setCustomFieldValues((current) => ({
                                  ...current,
                                  [field.id]: event.target.value,
                                }));
                              }}
                              placeholder={field.placeholder || "Enter your response"}
                              className="w-full rounded-xl border border-gray-700 bg-[#111127] px-4 py-3 text-sm text-white focus:border-cyan-500 focus:outline-none"
                            />
                          )}
                          {field.helpText ? (
                            <p className="mt-2 text-xs text-gray-500">{field.helpText}</p>
                          ) : null}
                        </Field>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-gray-800 bg-[#0c0c1d] p-5">
                <div>
                  <p className="text-sm font-semibold text-white">Final Submission</p>
                  <p className="mt-1 text-sm text-gray-400">
                    The platform will re-fetch every public file URL and reject the submission if any file no longer matches its registered hash.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    void submitFinalLinks();
                  }}
                  disabled={isSubmitting}
                  className="rounded-xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
                >
                  {isSubmitting ? "Submitting..." : "Submit Final Links"}
                </button>
              </div>
            </>
          ) : (
            <div className="mt-6 rounded-2xl border border-gray-800 bg-[#0c0c1d] p-5 text-sm text-gray-400">
              {isDepotOpen
                ? "Public link submission will appear here after the depot closes."
                : "The depot has not closed yet, so the public link form is hidden."}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-gray-800 bg-[#111127] p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Current Submission</h2>
              <p className="mt-2 text-sm text-gray-400">
                {submission
                  ? `Last updated ${formatMainProjectDate(submission.updatedAt)}.`
                  : "No final submission has been saved yet."}
              </p>
            </div>
          </div>

          {submission ? (
            <div className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-2xl border border-gray-800 bg-[#0c0c1d] p-5">
                <h3 className="text-lg font-semibold text-white">Verified Resources</h3>
                <div className="mt-4 flex flex-wrap gap-3">
                  {currentSubmissionFiles.map((entry) => (
                    <a
                      key={`${entry.label}:${entry.href}`}
                      href={entry.href}
                      target={entry.external ? "_blank" : undefined}
                      rel={entry.external ? "noreferrer" : undefined}
                      className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/35 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100 transition-colors hover:border-cyan-400/60 hover:bg-cyan-500/20"
                    >
                      <span>{entry.label}</span>
                      <span className="text-xs text-cyan-200/80">{entry.note}</span>
                    </a>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-800 bg-[#0c0c1d] p-5">
                <h3 className="text-lg font-semibold text-white">Submitted Inputs</h3>
                {submission.customFieldValues.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {submission.customFieldValues.map((entry) => {
                      const configuredField = customTextFields.find(
                        (field) => field.id === entry.fieldId
                      );

                      return (
                        <div
                          key={entry.fieldId}
                          className="rounded-xl border border-gray-800 bg-[#10182d] p-4"
                        >
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            {configuredField?.label || entry.fieldId}
                          </p>
                          <p className="mt-2 whitespace-pre-wrap text-sm text-gray-200">
                            {entry.value}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-gray-500">
                    No extra text fields were submitted.
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <label className="block mt-4 first:mt-0">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function InfoCard({
  hint,
  href,
  label,
  value,
}: {
  hint?: string;
  href?: string;
  label: string;
  value: string;
}) {
  const content = (
    <div className="rounded-2xl border border-gray-800 bg-[#111127] p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-white break-words">{value}</p>
      {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );

  if (!href) {
    return content;
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className="block">
      {content}
    </a>
  );
}

function StatusPill({ status }: { status: "closed" | "not-opened" | "open" }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
        status === "open"
          ? "bg-emerald-500/15 text-emerald-200"
          : status === "closed"
            ? "bg-amber-500/15 text-amber-200"
            : "bg-gray-700/60 text-gray-300"
      }`}
    >
      {status === "not-opened" ? "Not Opened" : status}
    </span>
  );
}

function ValidationMessage({
  validation,
}: {
  validation: FieldValidationState;
}) {
  if (validation.status === "idle") {
    return (
      <p className="mt-3 text-xs text-gray-500">
        Validate the public URL after the depot closes.
      </p>
    );
  }

  return (
    <p
      className={`mt-3 text-xs ${
        validation.status === "ok"
          ? "text-emerald-300"
          : validation.status === "error"
            ? "text-red-300"
            : "text-cyan-300"
      }`}
    >
      {validation.message}
    </p>
  );
}