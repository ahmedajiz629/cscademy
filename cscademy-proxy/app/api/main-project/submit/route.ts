import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getConvexServiceClient, getConvexUserClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  MAIN_PROJECT_TRACK_SLUG,
  isYouTubeUrl,
  isSha256Hex,
  type MainProjectCustomTextFieldValue,
  type MainProjectUploadFieldKey,
} from "@/lib/main-project";
import { verifyLinkedMainProjectUpload } from "@/lib/main-project-upload";

export const dynamic = "force-dynamic";

function normalizeCustomFieldValues(rawValues: unknown): MainProjectCustomTextFieldValue[] {
  if (!Array.isArray(rawValues)) {
    return [];
  }

  return rawValues.map((entry) => ({
    fieldId: String((entry as any)?.fieldId ?? "").trim(),
    value: String((entry as any)?.value ?? "").trim(),
  }));
}

async function requireRegisteredUpload(
  convexUser: Awaited<ReturnType<typeof getConvexUserClient>>,
  problemSlug: string,
  fieldKey: MainProjectUploadFieldKey,
  sha256: string
) {
  if (!isSha256Hex(sha256)) {
    throw new Error(`The ${fieldKey} hash must be a SHA-256 hex string.`);
  }

  const registration = await convexUser.query(api.mainProjectSubmissions.getRegisteredUpload, {
    fieldKey,
    problemSlug,
    sha256: sha256.trim().toLowerCase(),
  });

  if (!registration?.allowed) {
    throw new Error(
      `The ${fieldKey} file must be registered before the depot closes.`
    );
  }

  return registration;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const trackSlug = String(body.trackSlug ?? MAIN_PROJECT_TRACK_SLUG).trim();
    const problemSlug = String(body.problemSlug ?? "").trim();
    const demoType = body.demoType === "upload" ? "upload" : "youtube";

    if (trackSlug !== MAIN_PROJECT_TRACK_SLUG || !problemSlug) {
      return NextResponse.json({ error: "Invalid main project submission." }, { status: 400 });
    }

    const convexUser = await getConvexUserClient(auth);
    const problem = await convexUser.query(api.trackProblems.getBySlug, {
      trackSlug: MAIN_PROJECT_TRACK_SLUG,
      slug: problemSlug,
    });

    if (!problem) {
      return NextResponse.json({ error: "Problem not found." }, { status: 404 });
    }

    if (!problem.depotClosesAt || Date.now() <= problem.depotClosesAt) {
      return NextResponse.json(
        { error: "Public file links can only be submitted after the depot closes." },
        { status: 400 }
      );
    }

    const archiveRegistration = await requireRegisteredUpload(
      convexUser,
      problemSlug,
      "archive",
      String(body.archiveHash ?? "")
    );
    const presentationRegistration = await requireRegisteredUpload(
      convexUser,
      problemSlug,
      "presentation",
      String(body.presentationHash ?? "")
    );
    const reportRegistration = await requireRegisteredUpload(
      convexUser,
      problemSlug,
      "report",
      String(body.reportHash ?? "")
    );

    const archive = await verifyLinkedMainProjectUpload(
      String(body.archiveUrl ?? ""),
      archiveRegistration.sha256,
      {
        expectedFileSize: archiveRegistration.fileSize,
      }
    );
    const presentation = await verifyLinkedMainProjectUpload(
      String(body.presentationUrl ?? ""),
      presentationRegistration.sha256,
      {
        expectedFileSize: presentationRegistration.fileSize,
      }
    );
    const report = await verifyLinkedMainProjectUpload(
      String(body.reportUrl ?? ""),
      reportRegistration.sha256,
      {
        expectedFileSize: reportRegistration.fileSize,
      }
    );

    let demoUrl = String(body.demoUrl ?? "").trim();
    let demoHash: string | undefined;

    if (demoType === "youtube") {
      if (!isYouTubeUrl(demoUrl)) {
        return NextResponse.json(
          { error: "Demo URL must be a valid YouTube link or an uploaded MP4." },
          { status: 400 }
        );
      }
    } else {
      const demoRegistration = await requireRegisteredUpload(
        convexUser,
        problemSlug,
        "demoVideo",
        String(body.demoHash ?? "")
      );
      const demoUpload = await verifyLinkedMainProjectUpload(
        demoUrl,
        demoRegistration.sha256,
        {
          expectedFileSize: demoRegistration.fileSize,
        }
      );
      demoUrl = demoUpload.url;
      demoHash = demoUpload.sha256;
    }

    const serviceConvex = await getConvexServiceClient("main-project-submit");
    const submissionId = await serviceConvex.mutation(
      api.mainProjectSubmissions.saveVerifiedSubmission,
      {
        userId: auth.userId as Id<"users">,
        problemSlug,
        archiveUrl: archive.url,
        archiveHash: archive.sha256,
        presentationUrl: presentation.url,
        presentationHash: presentation.sha256,
        reportUrl: report.url,
        reportHash: report.sha256,
        demoType,
        demoUrl,
        demoHash,
        customFieldValues: normalizeCustomFieldValues(body.customFieldValues),
      }
    );

    return NextResponse.json({ ok: true, submissionId });
  } catch (error: any) {
    console.error("[API/main-project/submit] Error:", error);

    if (error?.details) {
      console.error("[API/main-project/submit] Error details:", error.details);
    }

    return NextResponse.json(
      { error: error.message || "Failed to submit main project depot." },
      { status: 500 }
    );
  }
}