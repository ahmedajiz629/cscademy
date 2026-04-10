"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { getTrack } from "@/lib/tracks";

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
  judgeFilePath?: string;
  starterSubmission?: string;
  downloadableFilePath?: string;
  externalLink?: string;
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
  judgeFilePath: "",
  starterSubmission: "",
  downloadableFilePath: "",
  externalLink: "",
  flag: "",
  isOffline: false,
  offlineTaskPreDescription: "",
};

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
  const setActive = useMutation(api.trackSettings.setActive);
  const setTrackLeaderboardConfig = useMutation(api.trackSettings.setLeaderboardConfig);

  const [mode, setMode] = useState<"view" | "add" | "edit">("view");
  const [editingId, setEditingId] = useState<Id<"trackProblems"> | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Id<"trackProblems"> | null>(null);
  const [trackLeaderboardVisibleDraft, setTrackLeaderboardVisibleDraft] = useState(false);
  const [trackCoefficientDraft, setTrackCoefficientDraft] = useState("1");

  const isSoftwareEngineeringTrack = trackId === "software-engineering";
  const isLogicReverseEngineeringTrack =
    trackId === "logic-reverse-engineering";
  const isCtfTrack = trackId === "ctf";
  const isAlgorithmicsTrack = trackId === "algorithmics";
  const isAlgorithmicsImportMode = isAlgorithmicsTrack && mode === "add";
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
    });
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
      judgeFilePath: p.judgeFilePath ?? "",
      starterSubmission: p.starterSubmission ?? "",
      downloadableFilePath: p.downloadableFilePath ?? "",
      externalLink: p.externalLink ?? "",
      flag: "",
      isOffline: p.isOffline ?? false,
      offlineTaskPreDescription: p.offlineTaskPreDescription ?? "",
    });
    setEditingId(p._id);
    setMode("edit");
  }

  function cancelForm() {
    setMode("view");
    setEditingId(null);
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
      const flag = isCtfTrack ? form.flag.trim() || undefined : undefined;
      const offlineTaskPreDescription = form.isOffline
        ? form.offlineTaskPreDescription.trim()
        : "";

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
          sampleInput: isSoftwareEngineeringTrack || isLogicReverseEngineeringTrack || isCtfTrack
            ? undefined
            : form.sampleInput || undefined,
          sampleOutput: isSoftwareEngineeringTrack || isLogicReverseEngineeringTrack || isCtfTrack
            ? undefined
            : form.sampleOutput || undefined,
          contestTaskId,
          referer:
            isSoftwareEngineeringTrack || isLogicReverseEngineeringTrack || isCtfTrack
              ? undefined
              : form.referer || undefined,
          publicRepositoryUrl,
          evaluationImage,
          evaluationCommand,
          baseCommit,
          defaultSubmissionRef,
          judgeFilePath,
          starterSubmission,
          downloadableFilePath,
          externalLink,
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
          sampleInput: isSoftwareEngineeringTrack || isLogicReverseEngineeringTrack || isCtfTrack
            ? undefined
            : form.sampleInput || undefined,
          sampleOutput: isSoftwareEngineeringTrack || isLogicReverseEngineeringTrack || isCtfTrack
            ? undefined
            : form.sampleOutput || undefined,
          contestTaskId,
          referer:
            isSoftwareEngineeringTrack || isLogicReverseEngineeringTrack || isCtfTrack
              ? undefined
              : form.referer || undefined,
          publicRepositoryUrl,
          evaluationImage,
          evaluationCommand,
          baseCommit,
          defaultSubmissionRef,
          judgeFilePath,
          starterSubmission,
          downloadableFilePath,
          externalLink,
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
                    placeholder='node --experimental-strip-types "$LOGIC_REVERSE_ENGINEERING_JUDGE_FILE" "$(cat "$LOGIC_REVERSE_ENGINEERING_SUBMISSION_FILE")"'
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
                    The judge source can be a public path or an external HTTP(S) URL. The configured command runs inside Docker after the platform copies the raw judge and submission files into the container. The submission is also piped to stdin. Available env vars include LOGIC_REVERSE_ENGINEERING_JUDGE_FILE and LOGIC_REVERSE_ENGINEERING_SUBMISSION_FILE.
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
                    File and link are optional. The flag is required for new problems, encrypted on the server, and never returned to the browser. Leave it blank while editing to keep the existing flag.
                  </p>
                </div>
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
