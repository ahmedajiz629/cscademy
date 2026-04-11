"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import MainProjectEvaluationMatrix from "@/components/admin/MainProjectEvaluationMatrix";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { formatScore } from "@/lib/score-format";
import { getTrack } from "@/lib/tracks";
import {
  formatMainProjectDate,
  getMainProjectDepotStatus,
  slugifyMainProjectFieldId,
  sumMainProjectEvaluationCoefficients,
  type MainProjectCustomTextField,
  type MainProjectEvaluationCriterion,
} from "@/lib/main-project";

type Problem = {
  _id: Id<"trackProblems">;
  slug: string;
  name: string;
  description: string;
  points: number;
  order: number;
  sampleInput?: string;
  sampleOutput?: string;
  contestTaskId?: number;
  referer?: string;
  starterCode?: string;
  isActive?: boolean;
  isOffline?: boolean;
  offlineTaskPreDescription?: string;
  leaderboardVisible?: boolean;
  publicRepositoryUrl?: string;
  evaluationImage?: string;
  evaluationCommand?: string;
  baseCommit?: string;
  defaultSubmissionRef?: string;
  extraDockerEnvVars?: string;
  judgeFilePath?: string;
  starterSubmission?: string;
  downloadableFilePath?: string;
  externalLink?: string;
  briefDownloadUrl?: string;
  customTextFields?: MainProjectCustomTextField[];
  evaluationCriteria?: MainProjectEvaluationCriterion[];
  depotOpensAt?: number;
  depotClosesAt?: number;
  flag?: string;
};

const EMPTY_FORM = {
  slug: "",
  name: "",
  description: "",
  points: 100,
  order: 1,
  sampleInput: "",
  sampleOutput: "",
  contestTaskId: "",
  referer: "",
  publicRepositoryUrl: "",
  evaluationImage: "",
  evaluationCommand: "",
  baseCommit: "",
  defaultSubmissionRef: "challenge",
  extraDockerEnvVars: "",
  judgeFilePath: "",
  starterSubmission: "",
  downloadableFilePath: "",
  externalLink: "",
  briefDownloadUrl: "",
  customTextFields: [] as MainProjectCustomTextField[],
  evaluationCriteria: [] as MainProjectEvaluationCriterion[],
  flag: "",
  isOffline: false,
  offlineTaskPreDescription: "",
};

function toLocalDateTimeValue(timestamp?: number) {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function parseLocalDateTimeValue(rawValue: string) {
  const timestamp = new Date(rawValue).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseExtraDockerEnvVars(rawValue?: string | null) {
  const invalidLines: string[] = [];

  for (const rawLine of (rawValue ?? "").split(/\r?\n/)) {
    const trimmedLine = rawLine.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");
    if (separatorIndex <= 0) {
      invalidLines.push(trimmedLine);
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      invalidLines.push(trimmedLine);
    }
  }

  return { invalidLines };
}

function serializeMainProjectEvaluationCriteria(
  criteria: MainProjectEvaluationCriterion[]
) {
  return JSON.stringify(
    criteria.map((criterion) => ({
      id: criterion.id.trim(),
      name: criterion.name.trim(),
      description: criterion.description?.trim() || "",
      coefficient: Number(criterion.coefficient),
    }))
  );
}

export default function AdminTrackDetailPage() {
  const params = useParams();
  const trackId = params.trackId as string;
  const track = getTrack(trackId);

  const problems = useQuery(api.trackProblems.listByTrackAdmin, { trackSlug: trackId });
  const languages = useQuery(api.programmingLanguages.listByTrack, { trackSlug: trackId });
  const settings = useQuery(api.trackSettings.getBySlug, { trackSlug: trackId });

  const createProblem = useMutation(api.trackProblems.create);
  const updateProblem = useMutation(api.trackProblems.update);
  const removeProblem = useMutation(api.trackProblems.remove);
  const setProblemActive = useMutation(api.trackProblems.setActive);
  const setProblemLeaderboardVisible = useMutation(api.trackProblems.setLeaderboardVisible);
  const openMainProjectDepot = useMutation(api.mainProjectSubmissions.openDepot);
  const closeMainProjectDepot = useMutation(api.mainProjectSubmissions.closeDepotNow);
  const setActive = useMutation(api.trackSettings.setActive);
  const setTrackLeaderboardConfig = useMutation(api.trackSettings.setLeaderboardConfig);

  const [mode, setMode] = useState<"view" | "add" | "edit">("view");
  const [editingId, setEditingId] = useState<Id<"trackProblems"> | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Id<"trackProblems"> | null>(null);
  const [trackLeaderboardVisibleDraft, setTrackLeaderboardVisibleDraft] = useState(false);
  const [trackCoefficientDraft, setTrackCoefficientDraft] = useState("1");
  const [depotCloseAtDraft, setDepotCloseAtDraft] = useState("");

  const isSoftwareEngineeringTrack = trackId === "software-engineering";
  const isLogicReverseEngineeringTrack =
    trackId === "logic-reverse-engineering";
  const isCtfTrack = trackId === "ctf";
  const isAlgorithmicsTrack = trackId === "algorithmics";
  const isMainProjectTrack = trackId === "main-project";
  const mainProjectAdminSubmissions = useQuery(
    api.mainProjectSubmissions.listByProblemAdmin,
    isMainProjectTrack && mode === "edit" && editingId
      ? { problemId: editingId }
      : "skip"
  );
  const isAlgorithmicsImportMode = isAlgorithmicsTrack && mode === "add";
  const editingProblem =
    editingId && problems
      ? problems.find((problem) => problem._id === editingId) ?? null
      : null;
  const draftEvaluationCriteriaSignature = serializeMainProjectEvaluationCriteria(
    form.evaluationCriteria
  );
  const persistedEvaluationCriteriaSignature = serializeMainProjectEvaluationCriteria(
    editingProblem?.evaluationCriteria ?? []
  );
  const hasUnsavedEvaluationCriteriaChanges =
    mode === "edit" &&
    isMainProjectTrack &&
    draftEvaluationCriteriaSignature !== persistedEvaluationCriteriaSignature;
  const evaluationCriteriaTotal = sumMainProjectEvaluationCoefficients(
    form.evaluationCriteria
  );
  const canAddProblem =
    !isSoftwareEngineeringTrack || (problems?.length ?? 0) === 0;
  const isFormValid = isAlgorithmicsImportMode
    ? !!form.contestTaskId.trim()
    : !!form.name.trim() &&
      !!form.description.trim() &&
      (mode !== "add" || !!form.slug.trim()) &&
      (!isSoftwareEngineeringTrack ||
        (!!form.publicRepositoryUrl.trim() &&
          !!form.evaluationImage.trim() &&
          !!form.baseCommit.trim())) &&
      (!isLogicReverseEngineeringTrack ||
        (!!form.judgeFilePath.trim() &&
          !!form.evaluationImage.trim() &&
          !!form.evaluationCommand.trim())) &&
      (!isMainProjectTrack ||
        (form.customTextFields.every((field) => !!field.label.trim()) &&
          form.evaluationCriteria.every(
            (criterion) =>
              !!criterion.name.trim() &&
              Number.isFinite(criterion.coefficient) &&
              criterion.coefficient >= 0
          ))) &&
      (!isCtfTrack || mode === "edit" || !!form.flag.trim());

  const isActive = settings !== undefined
    ? (settings?.isActive ?? (track?.isActive ?? true))
    : (track?.isActive ?? true);
  const isTrackLeaderboardVisible = settings?.leaderboardVisible === true;
  const trackCoefficient = settings?.leaderboardCoefficient ?? 1;

  useEffect(() => {
    setTrackLeaderboardVisibleDraft(isTrackLeaderboardVisible);
    setTrackCoefficientDraft(String(trackCoefficient));
  }, [isTrackLeaderboardVisible, trackCoefficient]);

  if (!track) {
    return <div className="p-8 text-gray-400">Track not found.</div>;
  }

  function startAdd() {
    const nextOrder = (problems?.length ?? 0) + 1;
    setForm({
      ...EMPTY_FORM,
      order: nextOrder,
      points: isSoftwareEngineeringTrack ? 20 : EMPTY_FORM.points,
      defaultSubmissionRef: isSoftwareEngineeringTrack ? "challenge" : "",
      starterSubmission: "",
      customTextFields: [],
      evaluationCriteria: [],
    });
    setDepotCloseAtDraft("");
    setEditingId(null);
    setMode("add");
  }

  function startEdit(p: Problem) {
    setForm({
      slug: p.slug,
      name: p.name,
      description: p.description,
      points: p.points,
      order: p.order,
      sampleInput: p.sampleInput ?? "",
      sampleOutput: p.sampleOutput ?? "",
      contestTaskId: p.contestTaskId !== undefined ? String(p.contestTaskId) : "",
      referer: p.referer ?? "",
      publicRepositoryUrl: p.publicRepositoryUrl ?? "",
      evaluationImage: p.evaluationImage ?? "",
      evaluationCommand: p.evaluationCommand ?? "",
      baseCommit: p.baseCommit ?? "",
      defaultSubmissionRef: p.defaultSubmissionRef ?? "challenge",
      extraDockerEnvVars: p.extraDockerEnvVars ?? "",
      judgeFilePath: p.judgeFilePath ?? "",
      starterSubmission: p.starterSubmission ?? "",
      downloadableFilePath: p.downloadableFilePath ?? "",
      externalLink: p.externalLink ?? "",
      briefDownloadUrl: p.briefDownloadUrl ?? "",
      customTextFields: (p.customTextFields ?? []).map((field) => ({ ...field })),
      evaluationCriteria: (p.evaluationCriteria ?? []).map((criterion) => ({
        ...criterion,
      })),
      flag: "",
      isOffline: p.isOffline ?? false,
      offlineTaskPreDescription: p.offlineTaskPreDescription ?? "",
    });
    setDepotCloseAtDraft(toLocalDateTimeValue(p.depotClosesAt));
    setEditingId(p._id);
    setMode("edit");
  }

  function cancelForm() {
    setMode("view");
    setEditingId(null);
    setDepotCloseAtDraft("");
  }

  function addMainProjectCustomField() {
    setForm((current) => ({
      ...current,
      customTextFields: [
        ...current.customTextFields,
        {
          id: `field-${crypto.randomUUID().slice(0, 8)}`,
          label: "",
          placeholder: "",
          helpText: "",
          required: true,
          multiline: true,
        },
      ],
    }));
  }

  function updateMainProjectCustomField(
    fieldId: string,
    patch: Partial<MainProjectCustomTextField>
  ) {
    setForm((current) => ({
      ...current,
      customTextFields: current.customTextFields.map((field) =>
        field.id === fieldId ? { ...field, ...patch } : field
      ),
    }));
  }

  function removeMainProjectCustomField(fieldId: string) {
    setForm((current) => ({
      ...current,
      customTextFields: current.customTextFields.filter((field) => field.id !== fieldId),
    }));
  }

  function addMainProjectEvaluationCriterion() {
    setForm((current) => ({
      ...current,
      evaluationCriteria: [
        ...current.evaluationCriteria,
        {
          id: `criterion-${crypto.randomUUID().slice(0, 8)}`,
          name: "",
          description: "",
          coefficient: 0,
        },
      ],
    }));
  }

  function updateMainProjectEvaluationCriterion(
    criterionId: string,
    patch: Partial<MainProjectEvaluationCriterion>
  ) {
    setForm((current) => ({
      ...current,
      evaluationCriteria: current.evaluationCriteria.map((criterion) =>
        criterion.id === criterionId ? { ...criterion, ...patch } : criterion
      ),
    }));
  }

  function removeMainProjectEvaluationCriterion(criterionId: string) {
    setForm((current) => ({
      ...current,
      evaluationCriteria: current.evaluationCriteria.filter(
        (criterion) => criterion.id !== criterionId
      ),
    }));
  }

  async function handleOpenDepot() {
    if (!editingId) {
      return;
    }

    const closesAt = parseLocalDateTimeValue(depotCloseAtDraft);
    if (!closesAt || closesAt <= Date.now()) {
      alert("Depot closing time must be a valid future date and time.");
      return;
    }

    try {
      await openMainProjectDepot({ problemId: editingId, closesAt });
    } catch (error: any) {
      alert(error.message || "Failed to open the depot.");
    }
  }

  async function handleCloseDepot() {
    if (!editingId) {
      return;
    }

    try {
      await closeMainProjectDepot({ problemId: editingId });
    } catch (error: any) {
      alert(error.message || "Failed to close the depot.");
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (isAlgorithmicsImportMode) {
        const response = await fetch("/api/admin/algorithmics/problems", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contestTaskId: Number(form.contestTaskId),
          }),
        });

        const data = await response.json();
        if (!response.ok || data.error) {
          throw new Error(data.error || "Failed to import CSAcademy problem.");
        }

        setMode("view");
        setEditingId(null);
        return;
      }

      const contestTaskId =
        !isSoftwareEngineeringTrack &&
        !isLogicReverseEngineeringTrack &&
        !isMainProjectTrack &&
        !isCtfTrack &&
        form.contestTaskId
        ? parseInt(form.contestTaskId)
        : undefined;
      const publicRepositoryUrl = isSoftwareEngineeringTrack
        ? form.publicRepositoryUrl.trim() || undefined
        : undefined;
      const evaluationImage =
        isSoftwareEngineeringTrack || isLogicReverseEngineeringTrack
        ? form.evaluationImage.trim() || undefined
        : undefined;
      const evaluationCommand = isLogicReverseEngineeringTrack
        ? form.evaluationCommand.trim() || undefined
        : undefined;
      const baseCommit = isSoftwareEngineeringTrack
        ? form.baseCommit.trim() || undefined
        : undefined;
      const defaultSubmissionRef = isSoftwareEngineeringTrack
        ? form.defaultSubmissionRef.trim() || undefined
        : undefined;
      const extraDockerEnvVars = isSoftwareEngineeringTrack
        ? form.extraDockerEnvVars.trim() || undefined
        : undefined;
      const judgeFilePath = isLogicReverseEngineeringTrack
        ? form.judgeFilePath.trim() || undefined
        : undefined;
      const starterSubmission = isLogicReverseEngineeringTrack
        ? form.starterSubmission
        : undefined;
      const downloadableFilePath = isCtfTrack
        ? form.downloadableFilePath.trim() || ""
        : undefined;
      const externalLink = isCtfTrack
        ? form.externalLink.trim() || ""
        : undefined;
      const briefDownloadUrl = isMainProjectTrack
        ? form.briefDownloadUrl.trim() || ""
        : undefined;
      const customTextFields = isMainProjectTrack
        ? form.customTextFields.map((field) => ({
            id: slugifyMainProjectFieldId(field.id || field.label),
            label: field.label.trim(),
            placeholder: field.placeholder?.trim() || undefined,
            helpText: field.helpText?.trim() || undefined,
            required: field.required === true,
            multiline: field.multiline === true,
          }))
        : undefined;
      const evaluationCriteria = isMainProjectTrack
        ? form.evaluationCriteria.map((criterion) => ({
            id: criterion.id.trim(),
            name: criterion.name.trim(),
            description: criterion.description?.trim() || undefined,
            coefficient: Number(criterion.coefficient),
          }))
        : undefined;
      const depotClosesAt =
        isMainProjectTrack && mode === "edit" && depotCloseAtDraft.trim()
          ? parseLocalDateTimeValue(depotCloseAtDraft)
          : undefined;
      const flag = isCtfTrack ? form.flag.trim() || undefined : undefined;
      const offlineTaskPreDescription = form.isOffline
        ? form.offlineTaskPreDescription.trim()
        : "";

      if (isSoftwareEngineeringTrack) {
        const { invalidLines } = parseExtraDockerEnvVars(form.extraDockerEnvVars);
        if (invalidLines.length > 0) {
          throw new Error(
            `Extra Docker env vars must use KEY=value format, one per line. Invalid lines: ${invalidLines.join(", ")}`
          );
        }
      }

      if (isMainProjectTrack) {
        if (mode === "edit" && depotCloseAtDraft.trim() && depotClosesAt === null) {
          throw new Error("Depot closing time must be a valid date and time.");
        }

        const emptyLabel = customTextFields?.find((field) => !field.label.trim());
        if (emptyLabel) {
          throw new Error("Each main project custom field needs a label.");
        }

        const emptyCriterion = evaluationCriteria?.find(
          (criterion) => !criterion.name.trim()
        );
        if (emptyCriterion) {
          throw new Error("Each evaluation criterion needs a name.");
        }

        const invalidCriterion = evaluationCriteria?.find(
          (criterion) =>
            !Number.isFinite(criterion.coefficient) || criterion.coefficient < 0
        );
        if (invalidCriterion) {
          throw new Error(
            "Each evaluation criterion needs a valid non-negative coefficient."
          );
        }
      }

      if (isCtfTrack) {
        const response = await fetch(
          mode === "add"
            ? "/api/admin/ctf/problems"
            : `/api/admin/ctf/problems/${editingId}`,
          {
            method: mode === "add" ? "POST" : "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              slug: form.slug.trim().toLowerCase().replace(/\s+/g, "-"),
              name: form.name.trim(),
              description: form.description.trim(),
              points: Number(form.points),
              order: Number(form.order),
              downloadableFilePath,
              externalLink,
              flag,
              isOffline: form.isOffline,
              offlineTaskPreDescription,
            }),
          }
        );

        const data = await response.json();
        if (!response.ok || data.error) {
          throw new Error(data.error || "Failed to save CTF problem.");
        }

        setMode("view");
        setEditingId(null);
        return;
      }

      if (mode === "add") {
        await createProblem({
          trackSlug: trackId,
          slug: form.slug.trim().toLowerCase().replace(/\s+/g, "-"),
          name: form.name.trim(),
          description: form.description.trim(),
          points: Number(form.points),
          order: Number(form.order),
          sampleInput: isSoftwareEngineeringTrack || isLogicReverseEngineeringTrack || isMainProjectTrack || isCtfTrack
            ? undefined
            : form.sampleInput || undefined,
          sampleOutput: isSoftwareEngineeringTrack || isLogicReverseEngineeringTrack || isMainProjectTrack || isCtfTrack
            ? undefined
            : form.sampleOutput || undefined,
          contestTaskId,
          referer:
            isSoftwareEngineeringTrack || isLogicReverseEngineeringTrack || isMainProjectTrack || isCtfTrack
              ? undefined
              : form.referer || undefined,
          publicRepositoryUrl,
          evaluationImage,
          evaluationCommand,
          baseCommit,
          defaultSubmissionRef,
          extraDockerEnvVars,
          judgeFilePath,
          starterSubmission,
          downloadableFilePath,
          externalLink,
          briefDownloadUrl,
          customTextFields,
          evaluationCriteria,
          isOffline: form.isOffline,
          offlineTaskPreDescription,
        });
      } else if (mode === "edit" && editingId) {
        await updateProblem({
          id: editingId,
          name: form.name.trim(),
          description: form.description.trim(),
          points: Number(form.points),
          order: Number(form.order),
          sampleInput: isSoftwareEngineeringTrack || isLogicReverseEngineeringTrack || isMainProjectTrack || isCtfTrack
            ? undefined
            : form.sampleInput || undefined,
          sampleOutput: isSoftwareEngineeringTrack || isLogicReverseEngineeringTrack || isMainProjectTrack || isCtfTrack
            ? undefined
            : form.sampleOutput || undefined,
          contestTaskId,
          referer:
            isSoftwareEngineeringTrack || isLogicReverseEngineeringTrack || isMainProjectTrack || isCtfTrack
              ? undefined
              : form.referer || undefined,
          publicRepositoryUrl,
          evaluationImage,
          evaluationCommand,
          baseCommit,
          defaultSubmissionRef,
          extraDockerEnvVars,
          judgeFilePath,
          starterSubmission,
          downloadableFilePath,
          externalLink,
          briefDownloadUrl,
          customTextFields,
          evaluationCriteria,
          depotClosesAt: depotClosesAt ?? undefined,
          isOffline: form.isOffline,
          offlineTaskPreDescription,
        });
      }
      setMode("view");
      setEditingId(null);
    } catch (e: any) {
      alert("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: Id<"trackProblems">) {
    await removeProblem({ id });
    setDeleteConfirm(null);
  }

  async function handleSaveTrackLeaderboardConfig(nextVisible?: boolean) {
    const parsedCoefficient = Number(trackCoefficientDraft);
    if (!Number.isFinite(parsedCoefficient) || parsedCoefficient < 0) {
      alert("Track coefficient must be a valid non-negative number.");
      setTrackCoefficientDraft(String(trackCoefficient));
      return;
    }

    try {
      await setTrackLeaderboardConfig({
        trackSlug: trackId,
        leaderboardVisible: nextVisible ?? trackLeaderboardVisibleDraft,
        leaderboardCoefficient: parsedCoefficient,
        currentIsActive: isActive,
      });
    } catch (error: any) {
      alert(error.message || "Failed to update leaderboard settings.");
      setTrackLeaderboardVisibleDraft(isTrackLeaderboardVisible);
      setTrackCoefficientDraft(String(trackCoefficient));
    }
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Back */}
      <div className="mb-4">
        <Link href="/admin/tracks" className="text-sm text-gray-400 hover:text-white transition-colors">
          ← Back to tracks
        </Link>
      </div>

      {/* Track header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            <span className="mr-2">{track.icon}</span>
            {track.name}
          </h1>
          <p className="text-sm text-gray-400 mt-1">{track.description}</p>
          <p className="text-xs text-gray-500 mt-2">
            {track.runEndpoint === track.submitEndpoint ? (
              <>
                Evaluate: <code className="text-gray-400">{track.submitEndpoint}</code>
              </>
            ) : (
              <>
                Run: <code className="text-gray-400">{track.runEndpoint}</code>
                {" · "}Submit: <code className="text-gray-400">{track.submitEndpoint}</code>
              </>
            )}
          </p>
        </div>

        {/* Track active toggle */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <span className={`text-sm font-medium ${isActive ? "text-green-400" : "text-gray-500"}`}>
              {isActive ? "Active" : "Inactive"}
            </span>
            <button
              onClick={() => setActive({ trackSlug: trackId, isActive: !isActive })}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                isActive ? "bg-green-500" : "bg-gray-600"
              }`}
              title={isActive ? "Disable track" : "Enable track"}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                  isActive ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`text-sm font-medium ${
                trackLeaderboardVisibleDraft ? "text-blue-400" : "text-gray-500"
              }`}
            >
              Leaderboard
            </span>
            <button
              onClick={() => {
                const nextValue = !trackLeaderboardVisibleDraft;
                setTrackLeaderboardVisibleDraft(nextValue);
                void handleSaveTrackLeaderboardConfig(nextValue);
              }}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                trackLeaderboardVisibleDraft ? "bg-blue-500" : "bg-gray-600"
              }`}
              title={
                trackLeaderboardVisibleDraft
                  ? "Disable track leaderboard"
                  : "Enable track leaderboard"
              }
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                  trackLeaderboardVisibleDraft ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-400">
            <span>Coeff.</span>
            <input
              type="number"
              min={0}
              step="0.1"
              value={trackCoefficientDraft}
              onChange={(event) => setTrackCoefficientDraft(event.target.value)}
              onBlur={() => void handleSaveTrackLeaderboardConfig()}
              className="w-24 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </label>
        </div>
      </div>

      {/* Languages info */}
      <div className="mb-6 p-4 bg-[#111127] border border-gray-800 rounded-xl">
        <h2 className="text-xs font-semibold text-gray-400 uppercase mb-2">
          {isSoftwareEngineeringTrack
            ? "Runtime"
            : isLogicReverseEngineeringTrack
              ? "Judge Runtime"
              : isMainProjectTrack
                ? "Depot Workflow"
              : isCtfTrack
                ? "Challenge Type"
            : `Languages (${languages?.length ?? "…"})`}
        </h2>
        {isSoftwareEngineeringTrack ? (
          <p className="text-sm text-gray-300">
            Repository submissions are evaluated inside Docker and do not use in-browser editor languages.
          </p>
        ) : isLogicReverseEngineeringTrack ? (
          <p className="text-sm text-gray-300">
            Students submit a single string expression that is checked by a downloadable judge using the configured Docker image and command.
          </p>
        ) : isMainProjectTrack ? (
          <p className="text-sm text-gray-300">
            Students prepare their final files in advance, register the exact file hashes while the depot is open, then submit public file links after the depot closes.
          </p>
        ) : isCtfTrack ? (
          <p className="text-sm text-gray-300">
            Students read the description, optionally download an attached file or follow a resource link, and submit the exact flag for server-side validation.
          </p>
        ) : languages ? (
          <p className="text-sm text-gray-300">{languages.map((l) => l.name).join(", ")}</p>
        ) : (
          <p className="text-sm text-gray-500">Loading…</p>
        )}
        <p className="text-xs text-gray-600 mt-1">
          {isSoftwareEngineeringTrack || isLogicReverseEngineeringTrack
            ? "Docker must be available on the server that runs this app."
            : isMainProjectTrack
              ? "The platform stores file hashes during the depot, validates public links after closure, and serves verified downloads through the app."
            : isCtfTrack
              ? "The flag is stored server-side and is not exposed through the student problem API."
            : "Languages are seeded from the evaluation provider and cannot be edited here."}
        </p>
      </div>

      {/* Problems section */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-white">
          Problems ({problems?.length ?? "…"})
        </h2>
        {mode === "view" && canAddProblem && (
          <button
            onClick={startAdd}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            {isAlgorithmicsTrack ? "+ Import From CSAcademy" : "+ Add Problem"}
          </button>
        )}
      </div>
      {mode === "view" && isSoftwareEngineeringTrack && !canAddProblem && (
        <p className="text-xs text-gray-500 mb-4">
          This track supports a single challenge, which is already configured below.
        </p>
      )}

      {/* Add / Edit form */}
      {(mode === "add" || mode === "edit") && (
        <div className="mb-6 p-5 bg-[#111127] border border-blue-500/30 rounded-xl">
          <h3 className="text-sm font-semibold text-blue-400 mb-4">
            {mode === "add"
              ? isAlgorithmicsTrack
                ? "Import Algorithmics Problem"
                : "New Problem"
              : "Edit Problem"}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {mode === "add" && !isAlgorithmicsTrack && (
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs text-gray-400 mb-1">Slug (URL-safe, unique)</label>
                <input
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="my-problem-slug"
                />
              </div>
            )}
            {!isAlgorithmicsImportMode && (
              <>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs text-gray-400 mb-1">Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Problem Name"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs text-gray-400 mb-1">Points</label>
                  <input
                    type="number"
                    value={form.points}
                    onChange={(e) => setForm({ ...form, points: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs text-gray-400 mb-1">Order</label>
                  <input
                    type="number"
                    value={form.order}
                    onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs text-gray-400 mb-1">Delivery Mode</label>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, isOffline: !form.isOffline })}
                    className={`w-full flex items-center justify-between px-3 py-2 text-sm border rounded-lg transition-colors ${
                      form.isOffline
                        ? "bg-amber-500/10 border-amber-500/40 text-amber-300"
                        : "bg-gray-800 border-gray-700 text-gray-200"
                    }`}
                  >
                    <span>{form.isOffline ? "Offline / LAN gated" : "Regular online"}</span>
                    <span className="text-xs uppercase tracking-wide">
                      {form.isOffline ? "Offline" : "Online"}
                    </span>
                  </button>
                </div>
                {form.isOffline && (
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-400 mb-1">
                      Offline Pre-Description
                    </label>
                    <textarea
                      rows={4}
                      value={form.offlineTaskPreDescription}
                      onChange={(e) =>
                        setForm({ ...form, offlineTaskPreDescription: e.target.value })
                      }
                      className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                      placeholder="Information the participant needs before heading to the offline room for this task."
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Shown on this task&apos;s offline confirmation screen only.
                    </p>
                  </div>
                )}
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Description</label>
                  <textarea
                    rows={6}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y font-mono"
                    placeholder="Problem statement…"
                  />
                </div>
              </>
            )}
            {isAlgorithmicsImportMode ? (
              <>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs text-gray-400 mb-1">CSAcademy Task ID</label>
                  <input
                    type="number"
                    value={form.contestTaskId}
                    onChange={(e) => setForm({ ...form, contestTaskId: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. 51724"
                  />
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-500">
                    The importer fetches the CSAcademy statement, samples, points, task URL, and default starter templates automatically. Order is assigned to the end of the current algorithmics list.
                  </p>
                </div>
              </>
            ) : isSoftwareEngineeringTrack ? (
              <>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Public Repository URL</label>
                  <input
                    value={form.publicRepositoryUrl}
                    onChange={(e) => setForm({ ...form, publicRepositoryUrl: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="https://github.com/ajiz-org/software-engineering-challenge"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs text-gray-400 mb-1">Docker Image</label>
                  <input
                    value={form.evaluationImage}
                    onChange={(e) => setForm({ ...form, evaluationImage: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="ajiztech/challenge-1"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs text-gray-400 mb-1">Base Commit</label>
                  <input
                    value={form.baseCommit}
                    onChange={(e) => setForm({ ...form, baseCommit: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    placeholder="fe8afb"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs text-gray-400 mb-1">Default Branch</label>
                  <input
                    value={form.defaultSubmissionRef}
                    onChange={(e) =>
                      setForm({ ...form, defaultSubmissionRef: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="challenge"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">
                    Extra Docker Env Vars
                  </label>
                  <textarea
                    rows={5}
                    value={form.extraDockerEnvVars}
                    onChange={(e) =>
                      setForm({ ...form, extraDockerEnvVars: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y font-mono"
                    placeholder={"FEATURE_FLAG=1\nLOCALE=fr\n# Blank lines and comments are allowed"}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    One KEY=value pair per line. These values are passed to the Docker image for both server evaluation and the generated local Docker command.
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-500">
                    Students clone the public repository above, then submit a private repository URL, branch, and GitHub token at evaluation time.
                  </p>
                </div>
              </>
            ) : isLogicReverseEngineeringTrack ? (
              <>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs text-gray-400 mb-1">Judge URL / Public Path</label>
                  <input
                    value={form.judgeFilePath}
                    onChange={(e) => setForm({ ...form, judgeFilePath: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    placeholder="/test.ts or https://example.com/judges/test.ts"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs text-gray-400 mb-1">Docker Image</label>
                  <input
                    value={form.evaluationImage}
                    onChange={(e) => setForm({ ...form, evaluationImage: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="node:22-alpine"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Evaluation Command</label>
                  <input
                    value={form.evaluationCommand}
                    onChange={(e) => setForm({ ...form, evaluationCommand: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    placeholder='node --experimental-strip-types "$1" "$(cat "$2")"'
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Starter Submission</label>
                  <textarea
                    rows={4}
                    value={form.starterSubmission}
                    onChange={(e) =>
                      setForm({ ...form, starterSubmission: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y font-mono"
                    placeholder="Optional starter expression shown to students"
                  />
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-500">
                    The judge source can be a public path or an external HTTP(S) URL. The configured command runs inside Docker after the platform copies the raw judge and submission files into the container. The submission is also piped to stdin. Inside the shell command, use $1 for the copied judge path, $2 for the copied submission path, and $3 for the original judge source value.
                  </p>
                </div>
              </>
            ) : isCtfTrack ? (
              <>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs text-gray-400 mb-1">Downloadable File URL / Public Path</label>
                  <input
                    value={form.downloadableFilePath}
                    onChange={(e) =>
                      setForm({ ...form, downloadableFilePath: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    placeholder="/files/challenge.zip or https://example.com/challenge.zip"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs text-gray-400 mb-1">Optional Resource Link</label>
                  <input
                    value={form.externalLink}
                    onChange={(e) => setForm({ ...form, externalLink: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="https://example.com/writeup-or-portal"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">Flag</label>
                  <input
                    value={form.flag}
                    onChange={(e) => setForm({ ...form, flag: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                    placeholder="flag{example}"
                  />
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-500">
                    File and link are optional. The flag is required for new problems, hashed on the server, and never returned to the browser. Leave it blank while editing to keep the existing hash.
                  </p>
                </div>
              </>
            ) : isMainProjectTrack ? (
              <>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">
                    Brief PDF / Resource URL
                  </label>
                  <input
                    value={form.briefDownloadUrl}
                    onChange={(e) => setForm({ ...form, briefDownloadUrl: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="/briefs/main-project.pdf or https://example.com/main-project.pdf"
                  />
                </div>

                <div className="col-span-2 rounded-xl border border-gray-800 bg-[#0d0d1d] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-semibold text-white">Custom Text Fields</h4>
                      <p className="mt-1 text-xs text-gray-500">
                        These fields appear in the depot submission form for participants.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addMainProjectCustomField}
                      className="rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-200 transition-colors hover:border-emerald-400/60 hover:text-emerald-100"
                    >
                      + Add Field
                    </button>
                  </div>

                  {form.customTextFields.length === 0 ? (
                    <p className="mt-4 text-sm text-gray-500">
                      No custom fields yet. Add fields such as project name, project summary, or the problem it solves.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {form.customTextFields.map((field, index) => (
                        <div key={field.id} className="rounded-lg border border-gray-800 bg-[#08101f] p-4">
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">Label</label>
                              <input
                                value={field.label}
                                onChange={(e) =>
                                  updateMainProjectCustomField(field.id, {
                                    id:
                                      field.label.trim() && field.id.startsWith("field-")
                                        ? slugifyMainProjectFieldId(e.target.value)
                                        : field.id,
                                    label: e.target.value,
                                  })
                                }
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder={`Field ${index + 1}`}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">Placeholder</label>
                              <input
                                value={field.placeholder ?? ""}
                                onChange={(e) =>
                                  updateMainProjectCustomField(field.id, {
                                    placeholder: e.target.value,
                                  })
                                }
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="Shown inside the participant input"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-xs text-gray-400 mb-1">Help Text</label>
                              <input
                                value={field.helpText ?? ""}
                                onChange={(e) =>
                                  updateMainProjectCustomField(field.id, {
                                    helpText: e.target.value,
                                  })
                                }
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder="Optional guidance shown under the field"
                              />
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={field.required === true}
                                  onChange={(e) =>
                                    updateMainProjectCustomField(field.id, {
                                      required: e.target.checked,
                                    })
                                  }
                                />
                                Required
                              </label>
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={field.multiline !== false}
                                  onChange={(e) =>
                                    updateMainProjectCustomField(field.id, {
                                      multiline: e.target.checked,
                                    })
                                  }
                                />
                                Multiline
                              </label>
                              <span className="font-mono text-gray-500">{field.id}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeMainProjectCustomField(field.id)}
                              className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 transition-colors hover:border-red-400/60 hover:text-red-200"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="col-span-2 rounded-xl border border-gray-800 bg-[#0d0d1d] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-semibold text-white">
                        Evaluation Criteria
                      </h4>
                      <p className="mt-1 text-xs text-gray-500">
                        Define the rubric used for inline student-by-criterion scoring.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addMainProjectEvaluationCriterion}
                      className="rounded-lg border border-cyan-500/30 px-3 py-1.5 text-xs font-medium text-cyan-200 transition-colors hover:border-cyan-400/60 hover:text-cyan-100"
                    >
                      + Add Criterion
                    </button>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500">
                    <span>
                      Rubric total:{" "}
                      <span className="text-gray-300">
                        {formatScore(evaluationCriteriaTotal)}
                      </span>
                    </span>
                    <span>
                      Problem points:{" "}
                      <span className="text-gray-300">{formatScore(form.points)}</span>
                    </span>
                  </div>

                  {form.evaluationCriteria.length > 0 &&
                    evaluationCriteriaTotal !== form.points && (
                      <p className="mt-2 text-xs text-amber-300">
                        The rubric total and the problem points differ. Saved matrix totals are clamped to the problem points on the participant score view and leaderboards.
                      </p>
                    )}

                  {form.evaluationCriteria.length === 0 ? (
                    <p className="mt-4 text-sm text-gray-500">
                      No evaluation criteria yet. Add items such as technical quality, presentation, or impact.
                    </p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {form.evaluationCriteria.map((criterion, index) => (
                        <div
                          key={criterion.id}
                          className="rounded-lg border border-gray-800 bg-[#08101f] p-4"
                        >
                          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">
                                Name
                              </label>
                              <input
                                value={criterion.name}
                                onChange={(e) =>
                                  updateMainProjectEvaluationCriterion(criterion.id, {
                                    name: e.target.value,
                                  })
                                }
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                placeholder={`Criterion ${index + 1}`}
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">
                                Coefficient
                              </label>
                              <input
                                type="number"
                                min={0}
                                step="0.1"
                                value={criterion.coefficient}
                                onChange={(e) =>
                                  updateMainProjectEvaluationCriterion(criterion.id, {
                                    coefficient: Number(e.target.value),
                                  })
                                }
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-xs text-gray-400 mb-1">
                                Description
                              </label>
                              <textarea
                                rows={3}
                                value={criterion.description ?? ""}
                                onChange={(e) =>
                                  updateMainProjectEvaluationCriterion(criterion.id, {
                                    description: e.target.value,
                                  })
                                }
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                                placeholder="Explain what this criterion measures"
                              />
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-mono text-gray-500">
                              {criterion.id}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                removeMainProjectEvaluationCriterion(criterion.id)
                              }
                              className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 transition-colors hover:border-red-400/60 hover:text-red-200"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="col-span-2">
                  <MainProjectEvaluationMatrix
                    criteria={editingProblem?.evaluationCriteria ?? []}
                    inputFields={editingProblem?.customTextFields ?? []}
                    participants={mainProjectAdminSubmissions}
                    problemPoints={editingProblem?.points ?? form.points}
                    disabledReason={
                      mode === "add"
                        ? "Save this problem before entering participant evaluations."
                        : !editingProblem
                          ? "Loading the saved problem configuration..."
                          : hasUnsavedEvaluationCriteriaChanges
                            ? "Save the evaluation criteria changes, then reopen this problem to score participants against the updated rubric."
                            : undefined
                    }
                  />
                </div>

                {mode === "edit" && editingId && (
                  <div className="col-span-2 rounded-xl border border-emerald-500/20 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(17,24,39,0.45))] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-semibold text-white">Depot Window</h4>
                        <p className="mt-1 text-xs text-gray-300">
                          Opening the depot sends a notification with a direct link to the participant form.
                        </p>
                      </div>
                      <span className="rounded-full bg-black/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-100">
                        {getMainProjectDepotStatus(
                          (problems ?? []).find((problem) => problem._id === editingId)?.depotOpensAt,
                          (problems ?? []).find((problem) => problem._id === editingId)?.depotClosesAt
                        ).replace("-", " ")}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
                      <div>
                        <label className="block text-xs text-gray-200 mb-1">Closes At</label>
                        <input
                          type="datetime-local"
                          value={depotCloseAtDraft}
                          onChange={(e) => setDepotCloseAtDraft(e.target.value)}
                          className="w-full rounded-lg border border-gray-700 bg-[#08101f] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleOpenDepot()}
                        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                      >
                        Open / Reopen Depot
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCloseDepot()}
                        className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-medium text-red-200 transition-colors hover:border-red-400/70 hover:text-red-100"
                      >
                        Close Now
                      </button>
                    </div>

                    <div className="mt-3 grid gap-2 text-xs text-gray-200 md:grid-cols-2">
                      <p>
                        Opens: {formatMainProjectDate((problems ?? []).find((problem) => problem._id === editingId)?.depotOpensAt)}
                      </p>
                      <p>
                        Closes: {formatMainProjectDate((problems ?? []).find((problem) => problem._id === editingId)?.depotClosesAt)}
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="col-span-1">
                  <label className="block text-xs text-gray-400 mb-1">Sample Input</label>
                  <textarea
                    rows={3}
                    value={form.sampleInput}
                    onChange={(e) => setForm({ ...form, sampleInput: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y font-mono"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs text-gray-400 mb-1">Sample Output</label>
                  <textarea
                    rows={3}
                    value={form.sampleOutput}
                    onChange={(e) => setForm({ ...form, sampleOutput: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y font-mono"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs text-gray-400 mb-1">Judge Task ID</label>
                  <input
                    type="number"
                    value={form.contestTaskId}
                    onChange={(e) => setForm({ ...form, contestTaskId: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. 51724"
                  />
                </div>
                <div className="col-span-1">
                  <label className="block text-xs text-gray-400 mb-1">Source URL</label>
                  <input
                    value={form.referer}
                    onChange={(e) => setForm({ ...form, referer: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="https://problem-source.example/..."
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={saving || !isFormValid}
              className="px-4 py-2 text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
            >
              {saving
                ? "Saving…"
                : mode === "add"
                  ? isAlgorithmicsTrack
                    ? "Import Problem"
                    : "Create Problem"
                  : "Save Changes"}
            </button>
            <button
              onClick={cancelForm}
              className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Problem table */}
      {problems === undefined ? (
        <div className="text-gray-400">Loading problems…</div>
      ) : problems.length === 0 ? (
        <div className="text-gray-500 p-8 text-center border border-gray-800 rounded-xl">
          No problems yet. Click "Add Problem" to create the first one.
        </div>
      ) : (
        <div className="border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-[#111127] border-b border-gray-800">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Slug</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Mode</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                  {isLogicReverseEngineeringTrack
                    ? "Judge Source"
                    : isMainProjectTrack
                      ? "Depot"
                    : isCtfTrack
                      ? "File / Link"
                      : "Task ID"}
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Points</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Active</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Leaderboard</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((p) => {
                const problemActive = p.isActive !== false;
                const problemLeaderboardVisible = p.leaderboardVisible === true;
                return (
                <tr key={p._id} className={`border-b border-gray-800/50 hover:bg-[#111127]/50 ${!problemActive ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3 text-sm text-gray-500">{p.order}</td>
                  <td className="px-4 py-3 text-sm text-white font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-400 font-mono">{p.slug}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        p.isOffline
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-sky-500/20 text-sky-300"
                      }`}
                    >
                      {p.isOffline ? "Offline" : "Online"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400 font-mono break-all">
                    {isLogicReverseEngineeringTrack
                      ? p.judgeFilePath ?? "—"
                      : isMainProjectTrack
                        ? `${getMainProjectDepotStatus(p.depotOpensAt, p.depotClosesAt)}${p.depotClosesAt ? ` · ${formatMainProjectDate(p.depotClosesAt)}` : ""}`
                      : isCtfTrack
                        ? p.downloadableFilePath || p.externalLink || "—"
                      : p.contestTaskId ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">{p.points}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => setProblemActive({ id: p._id, isActive: !problemActive })}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                        problemActive ? "bg-green-500" : "bg-gray-600"
                      }`}
                      title={problemActive ? "Disable problem" : "Enable problem"}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                          problemActive ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() =>
                        setProblemLeaderboardVisible({
                          id: p._id,
                          leaderboardVisible: !problemLeaderboardVisible,
                        })
                      }
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                        problemLeaderboardVisible ? "bg-blue-500" : "bg-gray-600"
                      }`}
                      title={
                        problemLeaderboardVisible
                          ? "Disable problem leaderboard"
                          : "Enable problem leaderboard"
                      }
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
                          problemLeaderboardVisible ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {deleteConfirm === p._id ? (
                      <span className="flex items-center justify-end gap-2">
                        <span className="text-xs text-red-400">Delete?</span>
                        <button
                          onClick={() => handleDelete(p._id)}
                          className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
                        >
                          No
                        </button>
                      </span>
                    ) : (
                      <span className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => startEdit(p)}
                          className="text-xs px-2 py-1 text-blue-400 hover:text-blue-300 border border-blue-400/30 hover:border-blue-300 rounded transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(p._id)}
                          className="text-xs px-2 py-1 text-red-400 hover:text-red-300 border border-red-400/30 hover:border-red-300 rounded transition-colors"
                        >
                          Delete
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
