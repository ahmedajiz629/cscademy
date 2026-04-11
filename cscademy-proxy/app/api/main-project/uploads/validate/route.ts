import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getConvexUserClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import {
  isSha256Hex,
  type MainProjectUploadFieldKey,
} from "@/lib/main-project";
import { verifyLinkedMainProjectUpload } from "@/lib/main-project-upload";

const ALLOWED_FIELD_KEYS = new Set<MainProjectUploadFieldKey>([
  "archive",
  "presentation",
  "report",
  "demoVideo",
]);

function isAllowedFieldKey(value: string): value is MainProjectUploadFieldKey {
  return ALLOWED_FIELD_KEYS.has(value as MainProjectUploadFieldKey);
}

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const problemSlug = String(body.problemSlug ?? "").trim();
    const fieldKeyValue = String(body.fieldKey ?? "").trim();
    const fileUrl = String(body.fileUrl ?? "").trim();
    const sha256 = String(body.sha256 ?? "").trim().toLowerCase();

    if (!problemSlug || !fileUrl || !isAllowedFieldKey(fieldKeyValue)) {
      return NextResponse.json({ error: "Invalid link validation request." }, { status: 400 });
    }

    const fieldKey = fieldKeyValue;

    if (!isSha256Hex(sha256)) {
      return NextResponse.json({ error: "Upload hash must be SHA-256 hex." }, { status: 400 });
    }

    const convex = await getConvexUserClient(auth);
    const [problem, registration] = await Promise.all([
      convex.query(api.trackProblems.getBySlug, {
        trackSlug: "main-project",
        slug: problemSlug,
      }),
      convex.query(api.mainProjectSubmissions.getRegisteredUpload, {
        fieldKey,
        problemSlug,
        sha256,
      }),
    ]);

    if (!problem) {
      return NextResponse.json({ error: "Problem not found." }, { status: 404 });
    }

    if (!problem.depotClosesAt || Date.now() <= problem.depotClosesAt) {
      return NextResponse.json(
        { error: "Public file links can only be checked after the depot closes." },
        { status: 400 }
      );
    }

    if (!registration?.allowed) {
      return NextResponse.json(
        { error: "Register the file hash before the depot closes, then validate the public link." },
        { status: 403 }
      );
    }

    const verifiedUpload = await verifyLinkedMainProjectUpload(fileUrl, sha256, {
      expectedFileSize: registration.fileSize,
    });

    return NextResponse.json({
      fileName: registration.fileName,
      fileSize: verifiedUpload.fileSize,
      ok: true,
      sha256: verifiedUpload.sha256,
      url: verifiedUpload.url,
    });
  } catch (error: any) {
    console.error("[API/main-project/uploads/validate] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to validate the public file link." },
      { status: 500 }
    );
  }
}