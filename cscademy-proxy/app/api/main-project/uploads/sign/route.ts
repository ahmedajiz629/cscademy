import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getConvexUserClient } from "@/lib/convex-server";
import { api } from "@/convex/_generated/api";
import {
  buildSignedMainProjectUploadParams,
} from "@/lib/main-project-upload";
import {
  isSha256Hex,
  type MainProjectUploadFieldKey,
} from "@/lib/main-project";

const ALLOWED_FIELD_KEYS = new Set<MainProjectUploadFieldKey>([
  "archive",
  "presentation",
  "report",
  "demoVideo",
]);

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const problemSlug = String(body.problemSlug ?? "").trim();
    const fieldKey = String(body.fieldKey ?? "").trim() as MainProjectUploadFieldKey;
    const fileName = String(body.fileName ?? "").trim();
    const sha256 = String(body.sha256 ?? "").trim().toLowerCase();

    if (!problemSlug || !fileName || !ALLOWED_FIELD_KEYS.has(fieldKey)) {
      return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
    }

    if (!isSha256Hex(sha256)) {
      return NextResponse.json({ error: "Upload hash must be SHA-256 hex." }, { status: 400 });
    }

    const convex = await getConvexUserClient(auth);
    const authorization = await convex.query(
      api.mainProjectSubmissions.getUploadAuthorization,
      {
        problemSlug,
        fieldKey,
        sha256,
      }
    );

    if (!authorization.allowed) {
      return NextResponse.json(
        {
          error:
            "Upload is not authorized. Register the file hash before uploading, while the depot is open.",
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      buildSignedMainProjectUploadParams({
        fieldKey,
        fileName,
        problemSlug,
        sha256,
        userId: auth.userId,
      })
    );
  } catch (error: any) {
    console.error("[API/main-project/uploads/sign] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to sign upload." },
      { status: 500 }
    );
  }
}