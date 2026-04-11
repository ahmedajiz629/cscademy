import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getConvexServiceClient, getConvexUserClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  MAIN_PROJECT_TRACK_SLUG,
  isYouTubeUrl,
  type MainProjectCustomTextFieldValue,
} from "@/lib/main-project";
import { verifyConfiguredCloudinaryUpload } from "@/lib/main-project-upload";

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

    const archive = await verifyConfiguredCloudinaryUpload(
      String(body.archiveUrl ?? ""),
      String(body.archiveHash ?? "")
    );
    const presentation = await verifyConfiguredCloudinaryUpload(
      String(body.presentationUrl ?? ""),
      String(body.presentationHash ?? "")
    );
    const report = await verifyConfiguredCloudinaryUpload(
      String(body.reportUrl ?? ""),
      String(body.reportHash ?? "")
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
      const demoUpload = await verifyConfiguredCloudinaryUpload(
        demoUrl,
        String(body.demoHash ?? "")
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