"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { sha256 } from "js-sha256";
import { api } from "@/convex/_generated/api";
import { formatScore } from "@/lib/score-format";
import track from "@/lib/tracks/main-project";
import ProblemLeaderboardPanel from "@/components/leaderboards/ProblemLeaderboardPanel";
import {
  MAIN_PROJECT_UPLOAD_FIELDS,
  fileMatchesMainProjectField,
  formatMainProjectDate,
  getMainProjectDepotStatus,
  isInternalAppHref,
  isYouTubeUrl,
  normalizeOptionalResourceHref,
  type MainProjectCustomTextField,
  type MainProjectCustomTextFieldValue,
  type MainProjectUploadFieldKey,
} from "@/lib/main-project";

type MainProjectProblem = {
  slug: string;
  name: string;
  description: string;
  points: number;
  leaderboardVisible?: boolean;
  briefDownloadUrl?: string;
  customTextFields?: MainProjectCustomTextField[];
  depotOpensAt?: number;
  depotClosesAt?: number;
};

type ExistingSubmission = {
  archiveUrl: string;
  archiveHash: string;
  presentationUrl: string;
  presentationHash: string;
  reportUrl: string;
  reportHash: string;
  demoType: "youtube" | "upload";
  demoUrl: string;
  demoHash?: string;
  customFieldValues: MainProjectCustomTextFieldValue[];
  updatedAt: number;
};

type UploadStatus = "idle" | "hashing" | "uploading" | "uploaded" | "failed";

type UploadState = {
  status: UploadStatus;
  url: string;
  sha256: string;
  fileName: string;
  error?: string;
};

const EMPTY_UPLOAD_STATE: UploadState = {
  status: "idle",
  url: "",
  sha256: "",
  fileName: "",
};

function createEmptyUploadStates(): Record<MainProjectUploadFieldKey, UploadState> {
  return {
    archive: { ...EMPTY_UPLOAD_STATE },
    presentation: { ...EMPTY_UPLOAD_STATE },
    report: { ...EMPTY_UPLOAD_STATE },
    demoVideo: { ...EMPTY_UPLOAD_STATE },
  };
}

function readCustomFieldValues(
  submission?: ExistingSubmission | null
): Record<string, string> {
  return Object.fromEntries(
    (submission?.customFieldValues ?? []).map((entry) => [entry.fieldId, entry.value])
  );
}

function getUploadStatusLabel(status: UploadStatus) {
  switch (status) {
    case "hashing":
      return "Hashing...";
    case "uploading":
      return "Uploading...";
    case "uploaded":
      return "Uploaded";
    case "failed":
      return "Failed";
    default:
      return "Not uploaded";
  }
}

function SubmissionAssetLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-cyan-200 transition-colors hover:border-cyan-400/50 hover:text-cyan-100"
    >
      {label}
    </a>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-[#111127] p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-2 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

export default function MainProjectProblemPage() {
  const params = useParams();
  const problemId = params.problemId as string;
  const registerUpload = useMutation(api.mainProjectSubmissions.registerUpload);

  const problem = useQuery(api.trackProblems.getBySlug, {
    trackSlug: track.id,
    slug: problemId,
  }) as MainProjectProblem | null | undefined;
  const submission = useQuery(api.mainProjectSubmissions.getMineByProblem, {
    problemSlug: problemId,
  }) as ExistingSubmission | null | undefined;
  const scoreRecord = useQuery(api.scores.getMineByProblem, {
    trackSlug: track.id,
    problemSlug: problemId,
  });

  const [activeTab, setActiveTab] = useState<"details" | "leaderboard">("details");
  const [uploadStates, setUploadStates] = useState(createEmptyUploadStates);
  const [demoType, setDemoType] = useState<"youtube" | "upload">("youtube");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    setUploadStates(createEmptyUploadStates());
    setDemoType("youtube");
    setYoutubeUrl("");
    setCustomFieldValues({});
    setSubmitMessage(null);
  }, [problemId]);

  useEffect(() => {
    if (!submission) {
      return;
    }

    setUploadStates({
      archive: {
        status: "uploaded",
        url: submission.archiveUrl,
        sha256: submission.archiveHash,
        fileName: "Archive",
      },
      presentation: {
        status: "uploaded",
        url: submission.presentationUrl,
        sha256: submission.presentationHash,
        fileName: "Presentation",
      },
      report: {
        status: "uploaded",
        url: submission.reportUrl,
        sha256: submission.reportHash,
        fileName: "Report",
      },
      demoVideo:
        submission.demoType === "upload"
          ? {
              status: "uploaded",
              url: submission.demoUrl,
              sha256: submission.demoHash ?? "",
              fileName: "Demo video",
            }
          : { ...EMPTY_UPLOAD_STATE },
    });
    setDemoType(submission.demoType);
    setYoutubeUrl(submission.demoType === "youtube" ? submission.demoUrl : "");
    setCustomFieldValues(readCustomFieldValues(submission));
  }, [submission]);

  async function computeFileSha256(file: File) {
    const buffer = await file.arrayBuffer();
    return sha256(new Uint8Array(buffer));
  }

  async function handleUpload(fieldKey: MainProjectUploadFieldKey, file?: File | null) {
    if (!problem || !file) {
      return;
    }

    if (!fileMatchesMainProjectField(fieldKey, file.name, file.type)) {
      setUploadStates((current) => ({
        ...current,
        [fieldKey]: {
          ...EMPTY_UPLOAD_STATE,
          status: "failed",
          error: `Selected file does not match ${MAIN_PROJECT_UPLOAD_FIELDS[fieldKey].label}.`,
        },
      }));
      return;
    }

    setSubmitMessage(null);
    setUploadStates((current) => ({
      ...current,
      [fieldKey]: {
        ...EMPTY_UPLOAD_STATE,
        status: "hashing",
        fileName: file.name,
      },
    }));

    try {
      const fileHash = await computeFileSha256(file);

      await registerUpload({
        problemSlug: problemId,
        fieldKey,
        fileName: file.name,
        mimeType: file.type || undefined,
        fileSize: file.size,
        sha256: fileHash,
      });

      const signResponse = await fetch("/api/main-project/uploads/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          problemSlug: problemId,
          fieldKey,
          fileName: file.name,
          sha256: fileHash,
        }),
      });
      const signPayload = await signResponse.json();
      if (!signResponse.ok || signPayload.error) {
        throw new Error(signPayload.error || "Failed to sign upload.");
      }

      setUploadStates((current) => ({
        ...current,
        [fieldKey]: {
          ...current[fieldKey],
          status: "uploading",
          sha256: fileHash,
        },
      }));

      const formData = new FormData();
      formData.append("file", file);
      formData.append("api_key", signPayload.apiKey);
      formData.append("timestamp", String(signPayload.timestamp));
      formData.append("signature", signPayload.signature);
      formData.append("folder", signPayload.folder);
      formData.append("public_id", signPayload.publicId);
      formData.append("context", signPayload.context);

      const uploadResponse = await fetch(signPayload.uploadUrl, {
        method: "POST",
        body: formData,
      });
      const uploadPayload = await uploadResponse.json();
      if (!uploadResponse.ok || !uploadPayload.secure_url) {
        throw new Error(uploadPayload.error?.message || "Upload failed.");
      }

      setUploadStates((current) => ({
        ...current,
        [fieldKey]: {
          status: "uploaded",
          url: uploadPayload.secure_url,
          sha256: fileHash,
          fileName: file.name,
        },
      }));

      if (fieldKey === "demoVideo") {
        setDemoType("upload");
      }
    } catch (error: any) {
      setUploadStates((current) => ({
        ...current,
        [fieldKey]: {
          ...current[fieldKey],
          status: "failed",
          error: error.message || "Upload failed.",
        },
      }));
    }
  }

  function clearUpload(fieldKey: MainProjectUploadFieldKey) {
    setUploadStates((current) => ({
      ...current,
      [fieldKey]: { ...EMPTY_UPLOAD_STATE },
    }));
  }

  async function handleSubmit() {
    if (!problem) {
      return;
    }

    if (!uploadStates.archive.url || !uploadStates.presentation.url || !uploadStates.report.url) {
      setSubmitMessage({
        tone: "error",
        text: "Archive, presentation, and report uploads are required.",
      });
      return;
    }

    if (demoType === "youtube" && !isYouTubeUrl(youtubeUrl)) {
      setSubmitMessage({
        tone: "error",
        text: "Provide a valid YouTube URL or switch to MP4 upload.",
      });
      return;
    }

    if (demoType === "upload" && !uploadStates.demoVideo.url) {
      setSubmitMessage({
        tone: "error",
        text: "Upload the demo video or switch to a YouTube link.",
      });
      return;
    }

    const preparedCustomFieldValues = (problem.customTextFields ?? []).map((field) => ({
      fieldId: field.id,
      value: customFieldValues[field.id]?.trim() ?? "",
    }));

    setIsSubmitting(true);
    setSubmitMessage(null);

    try {
      const response = await fetch(track.submitEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackSlug: track.id,
          problemSlug: problemId,
          archiveUrl: uploadStates.archive.url,
          archiveHash: uploadStates.archive.sha256,
          presentationUrl: uploadStates.presentation.url,
          presentationHash: uploadStates.presentation.sha256,
          reportUrl: uploadStates.report.url,
          reportHash: uploadStates.report.sha256,
          demoType,
          demoUrl: demoType === "youtube" ? youtubeUrl.trim() : uploadStates.demoVideo.url,
          demoHash: demoType === "upload" ? uploadStates.demoVideo.sha256 : undefined,
          customFieldValues: preparedCustomFieldValues,
        }),
      });
      const payload = await response.json();
      if (!response.ok || payload.error) {
        throw new Error(payload.error || "Failed to submit depot package.");
      }

      setSubmitMessage({
        tone: "success",
        text:
          "Depot submission saved. Uploaded files were verified against their registered hashes.",
      });
    } catch (error: any) {
      setSubmitMessage({
        tone: "error",
        text: error.message || "Failed to submit depot package.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (problem === undefined || submission === undefined || scoreRecord === undefined) {
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

  const now = Date.now();
  const depotStatus = getMainProjectDepotStatus(problem.depotOpensAt, problem.depotClosesAt, now);
  const bestScore = scoreRecord?.score ?? null;
  const briefHref = normalizeOptionalResourceHref(problem.briefDownloadUrl);
  const briefIsInternal = isInternalAppHref(briefHref);

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

      {problem.leaderboardVisible && (
        <div className="mb-6 flex items-center gap-2 border-b border-gray-800">
          <button
            onClick={() => setActiveTab("details")}
            className={`rounded-t-xl px-4 py-2 text-sm transition-colors ${
              activeTab === "details"
                ? "bg-[#111127] text-white"
                : "text-gray-500 hover:text-white"
            }`}
          >
            Project
          </button>
          <button
            onClick={() => setActiveTab("leaderboard")}
            className={`rounded-t-xl px-4 py-2 text-sm transition-colors ${
              activeTab === "leaderboard"
                ? "bg-[#111127] text-white"
                : "text-gray-500 hover:text-white"
            }`}
          >
            Leaderboard
          </button>
        </div>
      )}

      {problem.leaderboardVisible && activeTab === "leaderboard" ? (
        <ProblemLeaderboardPanel trackSlug={track.id} problemSlug={problemId} />
      ) : (
        <div className="flex min-w-0 flex-col gap-6 xl:grid xl:grid-cols-[1.08fr_0.92fr]">
          <section className="min-w-0 space-y-6">
            <div className="rounded-2xl border border-gray-800 bg-[#111127] p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="mb-2 text-xs uppercase tracking-[0.2em] text-emerald-300">
                    Main Project
                  </p>
                  <h1 className="text-3xl font-bold text-white">{problem.name}</h1>
                  <p className="mt-2 text-sm text-gray-400">
                    Prepare your final project delivery package and submit it during the depot window.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-gray-500">Current Score</p>
                  <p className="text-2xl font-bold text-white">
                    {bestScore !== null ? formatScore(bestScore) : "—"}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">/{problem.points}</p>
                </div>
              </div>

              {briefHref && (
                <div className="mt-6 rounded-xl border border-emerald-500/20 bg-[linear-gradient(135deg,rgba(16,185,129,0.15),rgba(17,24,39,0.4))] p-4">
                  <p className="mb-2 text-xs uppercase tracking-[0.2em] text-emerald-300">
                    Project Brief
                  </p>
                  <p className="break-all text-sm font-medium text-white">{briefHref}</p>
                  <a
                    href={briefHref}
                    {...(briefIsInternal ? {} : { target: "_blank", rel: "noreferrer" })}
                    className="mt-4 inline-flex items-center rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition-colors hover:bg-emerald-400/20"
                  >
                    {briefIsInternal ? "Open brief" : "Open brief in new tab"}
                  </a>
                </div>
              )}

              <div className="mt-6 rounded-xl border border-gray-800 bg-[#0c0c1d] p-4">
                <p className="whitespace-pre-wrap text-sm leading-7 text-gray-300">
                  {problem.description}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <InfoCard label="Depot status" value={depotStatus.replace("-", " ")} />
              <InfoCard label="Opens" value={formatMainProjectDate(problem.depotOpensAt)} />
              <InfoCard label="Closes" value={formatMainProjectDate(problem.depotClosesAt)} />
            </div>

            {submission && (
              <div className="rounded-2xl border border-gray-800 bg-[#111127] p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Saved Submission</h2>
                    <p className="mt-2 text-sm text-gray-400">
                      Last updated {formatMainProjectDate(submission.updatedAt)}.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <SubmissionAssetLink href={submission.archiveUrl} label="Archive" />
                  <SubmissionAssetLink href={submission.presentationUrl} label="Presentation" />
                  <SubmissionAssetLink href={submission.reportUrl} label="Report" />
                  <SubmissionAssetLink
                    href={submission.demoUrl}
                    label={submission.demoType === "youtube" ? "Demo link" : "Demo video"}
                  />
                </div>
              </div>
            )}
          </section>

          <section id="depot" className="min-w-0 space-y-6">
            <div className="rounded-2xl border border-gray-800 bg-[#111127] p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Depot Submission</h2>
                  <p className="mt-2 text-sm text-gray-400">
                    Register each file hash first, upload directly to storage, then save the resulting links here.
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                    depotStatus === "open"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : depotStatus === "closed"
                        ? "bg-amber-500/15 text-amber-300"
                        : "bg-gray-700 text-gray-300"
                  }`}
                >
                  {depotStatus === "open"
                    ? "Depot open"
                    : depotStatus === "closed"
                      ? "Depot closed"
                      : "Awaiting depot opening"}
                </span>
              </div>

              <div className="mt-4 rounded-xl border border-gray-800 bg-[#0c0c1d] p-4 text-sm leading-6 text-gray-300">
                {depotStatus === "open"
                  ? "The depot is open. New file hashes can be registered now, and uploads can continue even if the closing time passes before Cloudinary finishes."
                  : depotStatus === "closed"
                    ? "The depot is closed. You can still save a submission if every uploaded file hash had already been registered before closure. New uploads cannot start now."
                    : "The depot has not been opened yet. You can review the brief and prepare your material, but uploads will unlock only after the admin opens the depot."}
              </div>

              <div className="mt-6 space-y-5">
                {([
                  "archive",
                  "presentation",
                  "report",
                ] as MainProjectUploadFieldKey[]).map((fieldKey) => {
                  const field = MAIN_PROJECT_UPLOAD_FIELDS[fieldKey];
                  const upload = uploadStates[fieldKey];

                  return (
                    <div
                      key={fieldKey}
                      className="rounded-xl border border-gray-800 bg-[#0b1324] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-white">{field.label}</p>
                          <p className="mt-1 text-xs text-gray-500">{getUploadStatusLabel(upload.status)}</p>
                          {upload.error && (
                            <p className="mt-2 text-xs text-red-300">{upload.error}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <label className="inline-flex cursor-pointer items-center rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition-colors hover:bg-cyan-400/20">
                            Upload
                            <input
                              type="file"
                              accept={field.accept}
                              className="hidden"
                              onChange={(event) =>
                                void handleUpload(fieldKey, event.target.files?.[0])
                              }
                              disabled={depotStatus !== "open" || upload.status === "uploading" || upload.status === "hashing"}
                            />
                          </label>
                          {upload.url && (
                            <button
                              type="button"
                              onClick={() => clearUpload(fieldKey)}
                              className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                      {upload.url && (
                        <div className="mt-3 rounded-lg border border-gray-800 bg-[#08101f] p-3 text-xs text-gray-300">
                          <p className="font-medium text-white">{upload.fileName}</p>
                          <p className="mt-1 break-all">{upload.url}</p>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="rounded-xl border border-gray-800 bg-[#0b1324] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">Demo</p>
                      <p className="mt-1 text-xs text-gray-500">
                        Submit either a YouTube link or an uploaded MP4.
                      </p>
                    </div>
                    <div className="flex rounded-lg border border-gray-700 p-1 text-xs">
                      <button
                        type="button"
                        onClick={() => setDemoType("youtube")}
                        className={`rounded-md px-3 py-1.5 transition-colors ${
                          demoType === "youtube"
                            ? "bg-red-500/20 text-red-200"
                            : "text-gray-400 hover:text-white"
                        }`}
                      >
                        YouTube
                      </button>
                      <button
                        type="button"
                        onClick={() => setDemoType("upload")}
                        className={`rounded-md px-3 py-1.5 transition-colors ${
                          demoType === "upload"
                            ? "bg-cyan-500/20 text-cyan-100"
                            : "text-gray-400 hover:text-white"
                        }`}
                      >
                        MP4 upload
                      </button>
                    </div>
                  </div>

                  {demoType === "youtube" ? (
                    <div className="mt-4">
                      <label className="block text-xs text-gray-400 mb-1">YouTube URL</label>
                      <input
                        value={youtubeUrl}
                        onChange={(event) => setYoutubeUrl(event.target.value)}
                        className="w-full rounded-lg border border-gray-700 bg-[#08101f] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-red-500"
                        placeholder="https://www.youtube.com/watch?v=..."
                      />
                    </div>
                  ) : (
                    <div className="mt-4 rounded-lg border border-gray-800 bg-[#08101f] p-3">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-white">Demo video upload</p>
                          <p className="mt-1 text-xs text-gray-500">
                            {getUploadStatusLabel(uploadStates.demoVideo.status)}
                          </p>
                          {uploadStates.demoVideo.error && (
                            <p className="mt-2 text-xs text-red-300">{uploadStates.demoVideo.error}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <label className="inline-flex cursor-pointer items-center rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition-colors hover:bg-cyan-400/20">
                            Upload MP4
                            <input
                              type="file"
                              accept={MAIN_PROJECT_UPLOAD_FIELDS.demoVideo.accept}
                              className="hidden"
                              onChange={(event) =>
                                void handleUpload("demoVideo", event.target.files?.[0])
                              }
                              disabled={depotStatus !== "open" || uploadStates.demoVideo.status === "uploading" || uploadStates.demoVideo.status === "hashing"}
                            />
                          </label>
                          {uploadStates.demoVideo.url && (
                            <button
                              type="button"
                              onClick={() => clearUpload("demoVideo")}
                              className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                      {uploadStates.demoVideo.url && (
                        <p className="mt-3 break-all text-xs text-gray-300">
                          {uploadStates.demoVideo.url}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {(problem.customTextFields ?? []).map((field) => (
                  <div key={field.id} className="rounded-xl border border-gray-800 bg-[#0b1324] p-4">
                    <label className="block text-sm font-semibold text-white mb-2">
                      {field.label}
                      {field.required && <span className="ml-2 text-xs text-amber-300">Required</span>}
                    </label>
                    {field.helpText && (
                      <p className="mb-2 text-xs text-gray-500">{field.helpText}</p>
                    )}
                    {field.multiline ? (
                      <textarea
                        rows={4}
                        value={customFieldValues[field.id] ?? ""}
                        onChange={(event) =>
                          setCustomFieldValues((current) => ({
                            ...current,
                            [field.id]: event.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-gray-700 bg-[#08101f] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-y"
                        placeholder={field.placeholder}
                      />
                    ) : (
                      <input
                        value={customFieldValues[field.id] ?? ""}
                        onChange={(event) =>
                          setCustomFieldValues((current) => ({
                            ...current,
                            [field.id]: event.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-gray-700 bg-[#08101f] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        placeholder={field.placeholder}
                      />
                    )}
                  </div>
                ))}
              </div>

              {submitMessage && (
                <div
                  className={`mt-6 rounded-xl border px-4 py-3 text-sm ${
                    submitMessage.tone === "success"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                      : "border-red-500/30 bg-red-500/10 text-red-100"
                  }`}
                >
                  {submitMessage.text}
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={isSubmitting}
                className="mt-6 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
              >
                {isSubmitting ? "Verifying and saving..." : "Save depot submission"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}