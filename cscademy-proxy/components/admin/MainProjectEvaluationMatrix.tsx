"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  MAIN_PROJECT_UPLOAD_FIELDS,
  buildMainProjectSubmissionDownloadHref,
  formatMainProjectDate,
  normalizeOptionalResourceHref,
  sumMainProjectEvaluationCoefficients,
  type MainProjectCustomTextField,
  type MainProjectCustomTextFieldValue,
  type MainProjectEvaluationCriterion,
  type MainProjectEvaluationScoreEntry,
} from "@/lib/main-project";
import { formatScore } from "@/lib/score-format";

export type MainProjectEvaluationMatrixSubmission = {
  _id: Id<"mainProjectSubmissions">;
  archiveUrl: string;
  customFieldValues: MainProjectCustomTextFieldValue[];
  demoType: "youtube" | "upload";
  demoUrl: string;
  presentationUrl: string;
  reportUrl: string;
  userId: Id<"users">;
  userName: string;
  userEmail: string;
  updatedAt: number;
  evaluationScores: MainProjectEvaluationScoreEntry[];
};

type MainProjectEvaluationMatrixProps = {
  criteria: MainProjectEvaluationCriterion[];
  inputFields?: MainProjectCustomTextField[];
  participants?: MainProjectEvaluationMatrixSubmission[];
  problemPoints: number;
  disabledReason?: string;
};

type MainProjectSubmissionInputEntry = {
  key: string;
  label: string;
  value: string;
};

type MainProjectSubmissionFileEntry = {
  external?: boolean;
  href: string;
  label: string;
  note?: string;
};

function getCellKey(
  submissionId: Id<"mainProjectSubmissions">,
  criterionId: string
) {
  return `${String(submissionId)}:${criterionId}`;
}

function buildDraftValues(
  participants?: MainProjectEvaluationMatrixSubmission[]
): Record<string, string> {
  const nextValues: Record<string, string> = {};

  for (const participant of participants ?? []) {
    for (const score of participant.evaluationScores ?? []) {
      nextValues[getCellKey(participant._id, score.criterionId)] = String(score.points);
    }
  }

  return nextValues;
}

function parseCellValue(rawValue: string, coefficient: number) {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return {
      entered: false,
      valid: true,
      value: undefined as number | undefined,
    };
  }

  const numericValue = Number(trimmed);
  const valid =
    Number.isFinite(numericValue) && numericValue >= 0 && numericValue <= coefficient;

  return {
    entered: true,
    valid,
    value: valid ? numericValue : undefined,
  };
}

function buildSubmissionInputEntries(
  submission: MainProjectEvaluationMatrixSubmission,
  inputFields?: MainProjectCustomTextField[]
) {
  const submittedValues = (submission.customFieldValues ?? [])
    .map((entry) => ({
      fieldId: entry.fieldId,
      value: entry.value.trim(),
    }))
    .filter((entry) => entry.value);
  const submittedValueById = new Map(
    submittedValues.map((entry) => [entry.fieldId, entry.value])
  );
  const knownFieldIds = new Set((inputFields ?? []).map((field) => field.id));
  const orderedEntries: MainProjectSubmissionInputEntry[] = (inputFields ?? []).flatMap(
    (field) => {
      const value = submittedValueById.get(field.id);

      if (!value) {
        return [];
      }

      return [
        {
          key: field.id,
          label: field.label.trim() || field.id,
          value,
        },
      ];
    }
  );
  const unknownEntries: MainProjectSubmissionInputEntry[] = submittedValues.flatMap(
    (entry) => {
      if (knownFieldIds.has(entry.fieldId)) {
        return [];
      }

      return [
        {
          key: entry.fieldId,
          label: entry.fieldId,
          value: entry.value,
        },
      ];
    }
  );

  return [...orderedEntries, ...unknownEntries];
}

function buildSubmissionFileEntries(
  submission: MainProjectEvaluationMatrixSubmission
) {
  const entries: MainProjectSubmissionFileEntry[] = [
    {
      href: buildMainProjectSubmissionDownloadHref(submission._id, "archive"),
      label: MAIN_PROJECT_UPLOAD_FIELDS.archive.label,
    },
    {
      href: buildMainProjectSubmissionDownloadHref(submission._id, "presentation"),
      label: MAIN_PROJECT_UPLOAD_FIELDS.presentation.label,
    },
    {
      href: buildMainProjectSubmissionDownloadHref(submission._id, "report"),
      label: MAIN_PROJECT_UPLOAD_FIELDS.report.label,
    },
    submission.demoType === "youtube"
      ? {
          external: true,
          href: normalizeOptionalResourceHref(submission.demoUrl),
          label: MAIN_PROJECT_UPLOAD_FIELDS.demoVideo.label,
          note: "YouTube",
        }
      : {
          href: buildMainProjectSubmissionDownloadHref(submission._id, "demoVideo"),
          label: MAIN_PROJECT_UPLOAD_FIELDS.demoVideo.label,
          note: "Upload",
        },
  ];

  return entries.filter((entry) => entry.href);
}

export default function MainProjectEvaluationMatrix({
  criteria,
  inputFields,
  participants,
  problemPoints,
  disabledReason,
}: MainProjectEvaluationMatrixProps) {
  const saveEvaluationScore = useMutation(api.mainProjectSubmissions.setEvaluationScore);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  const [pendingKeys, setPendingKeys] = useState<string[]>([]);
  const [errorByKey, setErrorByKey] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const sortedParticipants = [...(participants ?? [])].sort((left, right) => {
    if (left.userName !== right.userName) {
      return left.userName.localeCompare(right.userName);
    }

    return left.userEmail.localeCompare(right.userEmail);
  });
  const totalCriteriaPoints = sumMainProjectEvaluationCoefficients(criteria);
  const criteriaPointsMismatch = totalCriteriaPoints !== problemPoints;

  useEffect(() => {
    setDraftValues(buildDraftValues(participants));
    setPendingKeys([]);
    setErrorByKey({});
    setStatusMessage(null);
  }, [participants]);

  function getDraftValue(
    submissionId: Id<"mainProjectSubmissions">,
    criterionId: string
  ) {
    return draftValues[getCellKey(submissionId, criterionId)] ?? "";
  }

  function focusCell(nextRowIndex: number, nextColumnIndex: number) {
    const participant = sortedParticipants[nextRowIndex];
    const criterion = criteria[nextColumnIndex];

    if (!participant || !criterion) {
      return;
    }

    const nextInput = inputRefs.current[getCellKey(participant._id, criterion.id)];
    nextInput?.focus();
    nextInput?.select();
  }

  function handleArrowNavigation(
    event: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    columnIndex: number
  ) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusCell(Math.max(0, rowIndex - 1), columnIndex);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusCell(Math.min(sortedParticipants.length - 1, rowIndex + 1), columnIndex);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusCell(rowIndex, Math.max(0, columnIndex - 1));
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusCell(rowIndex, Math.min(criteria.length - 1, columnIndex + 1));
    }
  }

  async function commitCell(
    submission: MainProjectEvaluationMatrixSubmission,
    criterion: MainProjectEvaluationCriterion
  ) {
    const key = getCellKey(submission._id, criterion.id);
    const rawValue = getDraftValue(submission._id, criterion.id);
    const parsed = parseCellValue(rawValue, criterion.coefficient);

    if (!parsed.valid) {
      const message = `${submission.userName} / ${criterion.name} must be between 0 and ${formatScore(criterion.coefficient)}.`;
      setErrorByKey((current) => ({ ...current, [key]: message }));
      setStatusMessage(message);
      return;
    }

    const savedValue = submission.evaluationScores.find(
      (entry) => entry.criterionId === criterion.id
    )?.points;
    const nextValue = parsed.entered ? parsed.value : undefined;

    if (savedValue === nextValue) {
      setErrorByKey((current) => {
        const nextErrors = { ...current };
        delete nextErrors[key];
        return nextErrors;
      });
      return;
    }

    setPendingKeys((current) =>
      current.includes(key) ? current : [...current, key]
    );

    try {
      await saveEvaluationScore({
        submissionId: submission._id,
        criterionId: criterion.id,
        points: nextValue,
      });
      setStatusMessage(null);
      setErrorByKey((current) => {
        const nextErrors = { ...current };
        delete nextErrors[key];
        return nextErrors;
      });
    } catch (error: any) {
      const message = error.message || "Failed to save the evaluation score.";
      setErrorByKey((current) => ({ ...current, [key]: message }));
      setStatusMessage(message);
    } finally {
      setPendingKeys((current) => current.filter((entry) => entry !== key));
    }
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-[#0d0d1d] p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold text-white">Evaluation Matrix</h4>
          <p className="mt-1 text-xs text-gray-500">
            Rows are submitted participants. Use the arrow keys to move between cells.
          </p>
        </div>
        <div className="text-right text-xs text-gray-500">
          <p>{sortedParticipants.length} submitted participant(s)</p>
          <p>{criteria.length} criterion/criteria</p>
        </div>
      </div>

      {criteriaPointsMismatch && (
        <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          The rubric totals {formatScore(totalCriteriaPoints)} points while the problem is configured for {formatScore(problemPoints)} points. Saved totals are clamped to the problem points for the score view and leaderboard.
        </p>
      )}

      {statusMessage && (
        <p className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {statusMessage}
        </p>
      )}

      {disabledReason ? (
        <p className="mt-4 text-sm text-gray-500">{disabledReason}</p>
      ) : criteria.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">
          Add at least one evaluation criterion to start scoring submissions.
        </p>
      ) : participants === undefined ? (
        <p className="mt-4 text-sm text-gray-500">Loading submitted participants...</p>
      ) : sortedParticipants.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">
          No submitted participants yet. The matrix will appear after the first depot submission.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-64 border-b border-gray-800 bg-[#0d0d1d] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Participant
                </th>
                {criteria.map((criterion) => {
                  const enteredCount = sortedParticipants.reduce((count, participant) => {
                    const parsed = parseCellValue(
                      getDraftValue(participant._id, criterion.id),
                      criterion.coefficient
                    );

                    return count + (parsed.entered && parsed.valid ? 1 : 0);
                  }, 0);

                  return (
                    <th
                      key={criterion.id}
                      className="min-w-52 border-b border-gray-800 px-4 py-3 text-left align-top text-xs font-semibold uppercase tracking-wide text-gray-400"
                    >
                      <div className="text-sm font-semibold normal-case text-white">
                        {criterion.name}
                      </div>
                      {criterion.description && (
                        <p className="mt-1 text-xs normal-case text-gray-500">
                          {criterion.description}
                        </p>
                      )}
                      <p className="mt-2 text-[11px] normal-case text-gray-500">
                        {enteredCount} / {sortedParticipants.length} entered
                      </p>
                    </th>
                  );
                })}
                <th className="min-w-32 border-b border-gray-800 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedParticipants.map((participant, rowIndex) => {
                const rowEnteredCount = criteria.reduce((count, criterion) => {
                  const parsed = parseCellValue(
                    getDraftValue(participant._id, criterion.id),
                    criterion.coefficient
                  );

                  return count + (parsed.entered && parsed.valid ? 1 : 0);
                }, 0);
                const rowTotal = criteria.reduce((total, criterion) => {
                  const parsed = parseCellValue(
                    getDraftValue(participant._id, criterion.id),
                    criterion.coefficient
                  );

                  return total + (parsed.entered && parsed.valid ? parsed.value ?? 0 : 0);
                }, 0);
                const inputEntries = buildSubmissionInputEntries(participant, inputFields);
                const fileEntries = buildSubmissionFileEntries(participant);

                return (
                  <Fragment key={participant._id}>
                    <tr key={participant._id} className="align-top">
                      <td className="sticky left-0 z-10 border-b border-gray-800 bg-[#0d0d1d] px-4 py-4">
                        <div className="text-sm font-medium text-white">{participant.userName}</div>
                        <div className="mt-1 text-xs text-gray-500">{participant.userEmail}</div>
                        <div className="mt-2 text-[11px] text-gray-500">
                          {rowEnteredCount} / {criteria.length} entered
                        </div>
                      </td>
                      {criteria.map((criterion, columnIndex) => {
                        const key = getCellKey(participant._id, criterion.id);
                        const rawValue = getDraftValue(participant._id, criterion.id);
                        const parsed = parseCellValue(rawValue, criterion.coefficient);
                        const isPending = pendingKeys.includes(key);
                        const hasError = Boolean(errorByKey[key]) || !parsed.valid;

                        return (
                          <td key={key} className="border-b border-gray-800 px-4 py-4">
                            <div className="flex items-center gap-2">
                              <input
                                ref={(node) => {
                                  inputRefs.current[key] = node;
                                }}
                                type="number"
                                inputMode="decimal"
                                min={0}
                                max={criterion.coefficient}
                                step="0.01"
                                value={rawValue}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  setDraftValues((current) => ({
                                    ...current,
                                    [key]: nextValue,
                                  }));
                                  if (errorByKey[key]) {
                                    setErrorByKey((current) => {
                                      const nextErrors = { ...current };
                                      delete nextErrors[key];
                                      return nextErrors;
                                    });
                                  }
                                }}
                                onBlur={() => void commitCell(participant, criterion)}
                                onKeyDown={(event) =>
                                  handleArrowNavigation(event, rowIndex, columnIndex)
                                }
                                className={`w-20 rounded-lg border px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 ${
                                  hasError
                                    ? "border-red-500/60 bg-red-500/10 focus:ring-red-400"
                                    : isPending
                                      ? "border-blue-500/50 bg-blue-500/10 focus:ring-blue-400"
                                      : "border-gray-700 bg-gray-800 focus:ring-blue-500"
                                }`}
                              />
                              <span className="text-xs text-gray-500">
                                / {formatScore(criterion.coefficient)}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                      <td className="border-b border-gray-800 px-4 py-4">
                        <div className="text-sm font-semibold text-white">
                          {formatScore(rowTotal)} / {formatScore(totalCriteriaPoints)}
                        </div>
                      </td>
                    </tr>

                    <tr key={`${String(participant._id)}:inputs`} className="align-top">
                      <td className="sticky left-0 z-10 border-b border-gray-800 bg-[#0d0d1d] px-4 py-3 align-top">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          Inputs
                        </div>
                      </td>
                      <td
                        colSpan={criteria.length + 1}
                        className="border-b border-gray-800 px-4 py-3"
                      >
                        {inputEntries.length === 0 ? (
                          <p className="text-xs text-gray-500">
                            No custom inputs were submitted for this participant.
                          </p>
                        ) : (
                          <div className="grid gap-2 lg:grid-cols-2">
                            {inputEntries.map((entry) => (
                              <div
                                key={`${String(participant._id)}:${entry.key}`}
                                className="rounded-lg border border-gray-800 bg-[#121226] px-3 py-2"
                              >
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                                  {entry.label}
                                </div>
                                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-200">
                                  {entry.value}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>

                    <tr key={`${String(participant._id)}:files`} className="align-top">
                      <td className="sticky left-0 z-10 border-b border-gray-800 bg-[#0d0d1d] px-4 py-3 align-top">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          Files
                        </div>
                      </td>
                      <td
                        colSpan={criteria.length + 1}
                        className="border-b border-gray-800 px-4 py-3"
                      >
                        <div className="flex flex-wrap gap-2">
                          {fileEntries.map((entry) => {
                            return (
                              <a
                                key={`${String(participant._id)}:${entry.label}`}
                                href={entry.href}
                                target={entry.external ? "_blank" : undefined}
                                rel={entry.external ? "noreferrer" : undefined}
                                className="inline-flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-200 transition-colors hover:border-blue-400/60 hover:bg-blue-500/15 hover:text-white"
                              >
                                <span>{entry.label}</span>
                                {entry.note ? (
                                  <span className="rounded-full border border-blue-400/20 px-2 py-0.5 text-[11px] uppercase tracking-wide text-blue-300/80">
                                    {entry.note}
                                  </span>
                                ) : null}
                              </a>
                            );
                          })}
                        </div>
                        <p className="mt-2 text-[11px] text-gray-500">
                          Last submission update: {formatMainProjectDate(participant.updatedAt)}
                        </p>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}