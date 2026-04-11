import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { getAuthUser } from "@/lib/auth";
import { importAlgorithmicsProblemFromCsacademy } from "@/lib/csacademy-public";
import { getConvexUserClient } from "@/lib/convex-server";

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth || auth.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const contestTaskId = Number(body.contestTaskId);

    if (!Number.isInteger(contestTaskId) || contestTaskId <= 0) {
      return NextResponse.json(
        { error: "A valid CSAcademy task ID is required." },
        { status: 400 }
      );
    }

    const convex = await getConvexUserClient(auth);
    const existingProblems = await convex.query(api.trackProblems.listByTrackAdmin, {
      trackSlug: "algorithmics",
    });

    if (existingProblems.some((problem) => problem.contestTaskId === contestTaskId)) {
      return NextResponse.json(
        { error: "That CSAcademy task has already been imported." },
        { status: 409 }
      );
    }

    const imported = await importAlgorithmicsProblemFromCsacademy(contestTaskId);

    if (existingProblems.some((problem) => problem.slug === imported.slug)) {
      return NextResponse.json(
        {
          error: `A problem with slug \"${imported.slug}\" already exists in algorithmics.`,
        },
        { status: 409 }
      );
    }

    const nextOrder =
      existingProblems.reduce((maxOrder, problem) => Math.max(maxOrder, problem.order), 0) +
      1;

    const problemId = await convex.mutation(api.trackProblems.create, {
      trackSlug: "algorithmics",
      slug: imported.slug,
      name: imported.name,
      description: imported.description,
      points: imported.points,
      order: nextOrder,
      sampleTests: imported.sampleTests,
      starterCode: imported.starterCode,
      contestTaskId: imported.contestTaskId,
      referer: imported.referer,
      isOffline: false,
    });

    return NextResponse.json({
      problemId,
      imported: {
        slug: imported.slug,
        name: imported.name,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Failed to import CSAcademy problem." },
      { status: 500 }
    );
  }
}