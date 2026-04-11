import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getAuthUser } from "@/lib/auth";
import { getConvexUserClient } from "@/lib/convex-server";
import { downloadVerifiedMainProjectUpload } from "@/lib/main-project-upload";
import { type MainProjectUploadFieldKey } from "@/lib/main-project";

const ALLOWED_FIELD_KEYS: MainProjectUploadFieldKey[] = [
  "archive",
  "presentation",
  "report",
  "demoVideo",
];

function isAllowedFieldKey(value: string): value is MainProjectUploadFieldKey {
  return ALLOWED_FIELD_KEYS.includes(value as MainProjectUploadFieldKey);
}

export const dynamic = "force-dynamic";

function buildTextErrorResponse(message: string, status: number) {
  return new NextResponse(message, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
    status,
  });
}

function sanitizeDownloadFilename(rawValue: string) {
  const trimmed = rawValue.trim();

  if (!trimmed) {
    return "download";
  }

  return trimmed.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-");
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return buildTextErrorResponse("Unauthorized", 401);
    }

    const url = new URL(req.url);
    const submissionId = url.searchParams.get("submissionId")?.trim() ?? "";
    const fieldKeyValue = url.searchParams.get("fieldKey")?.trim() ?? "";

    if (!submissionId || !isAllowedFieldKey(fieldKeyValue)) {
      return buildTextErrorResponse("Invalid download request.", 400);
    }

    const fieldKey = fieldKeyValue;

    const convex = await getConvexUserClient(auth);
    const asset = await convex.query(api.mainProjectSubmissions.getSubmissionDownloadAsset, {
      fieldKey,
      submissionId: submissionId as Id<"mainProjectSubmissions">,
    });

    if (!asset) {
      return buildTextErrorResponse("File not found.", 404);
    }

    const verifiedUpload = await downloadVerifiedMainProjectUpload(asset.url, asset.sha256, {
      expectedFileSize: asset.fileSize,
    });

    return new NextResponse(new Uint8Array(verifiedUpload.body), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${sanitizeDownloadFilename(asset.fileName)}"`,
        "Content-Length": String(verifiedUpload.fileSize),
        "Content-Type": verifiedUpload.contentType ?? "application/octet-stream",
      },
      status: 200,
    });
  } catch (error: any) {
    console.error("[API/main-project/uploads/download] Error:", error);

    const message = error.message || "Failed to download the linked file.";
    const status =
      message === "Unauthorized"
        ? 401
        : message === "Forbidden"
          ? 403
          : message.includes("tampered")
            ? 409
            : message.includes("not found")
              ? 404
              : 500;

    return buildTextErrorResponse(message, status);
  }
}