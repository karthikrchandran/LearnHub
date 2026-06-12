import { NextResponse } from "next/server";

import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { canLaunchRuntimeAssignment, type MembershipAuthContext } from "@/modules/auth/permissions";
import { normalizeCourseFeedback } from "@/modules/feedback/course-feedback";
import {
  createPrismaCourseFeedbackRepository,
  type CourseFeedbackRepository,
} from "@/modules/feedback/prisma-repository";

export const dynamic = "force-dynamic";

export type SubmitCourseFeedbackInput = {
  context: MembershipAuthContext;
  organizationId: string;
  assignmentId: string;
  stars: number;
  text: string | null;
  submittedAt: Date;
  repository: CourseFeedbackRepository;
};

export async function submitCourseFeedbackForLearner(input: SubmitCourseFeedbackInput) {
  const normalized = normalizeCourseFeedback({ stars: input.stars, text: input.text });
  const assignment = await input.repository.findAssignmentForFeedback({
    organizationId: input.organizationId,
    assignmentId: input.assignmentId,
  });

  if (!assignment || !canLaunchRuntimeAssignment(input.context, assignment)) {
    throw new Error("Assignment was not found");
  }

  if (assignment.courseType !== "NATIVE_VIDEO") {
    throw new Error("Course feedback is only supported for native video assignments");
  }

  const saved = await input.repository.upsertCourseFeedback({
    organizationId: input.organizationId,
    courseId: assignment.courseId,
    assignmentId: assignment.id,
    membershipId: assignment.membershipId,
    stars: normalized.stars,
    text: normalized.text,
    submittedAt: input.submittedAt,
  });

  return { ok: true, id: saved.id };
}

export function parseCourseFeedbackBody(body: unknown): { stars: number; text: string | null } {
  if (!body || typeof body !== "object") {
    throw new Error("stars must be a number");
  }

  const candidate = body as { stars?: unknown; text?: unknown };

  if (typeof candidate.stars !== "number") {
    throw new Error("stars must be a number");
  }

  return {
    stars: candidate.stars,
    text: typeof candidate.text === "string" ? candidate.text : null,
  };
}

type RouteContext = {
  params: Promise<{ slug: string; assignmentId: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { slug, assignmentId } = await params;
    const { context, organizationId } = await requireOrganizationMemberBySlug(slug);
    const { prisma } = await import("@/lib/prisma");
    const body = parseCourseFeedbackBody(await readRequestBody(request));
    const result = await submitCourseFeedbackForLearner({
      context,
      organizationId,
      assignmentId,
      stars: body.stars,
      text: body.text,
      submittedAt: new Date(),
      repository: createPrismaCourseFeedbackRepository(prisma),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Course feedback could not be submitted";

    if (isLoginRedirect(error)) {
      return NextResponse.json({ message: "Authentication required" }, { status: 401 });
    }

    if (isRedirect(error)) {
      return NextResponse.json({ message: "Not allowed to submit course feedback" }, { status: 403 });
    }

    const status = message.includes("not found") ? 404 : 400;

    return NextResponse.json({ message }, { status });
  }
}

async function readRequestBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Course feedback request body must be valid JSON");
  }
}

function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

function isLoginRedirect(error: unknown): boolean {
  return isRedirect(error) && (error as { digest: string }).digest.includes("/login");
}
