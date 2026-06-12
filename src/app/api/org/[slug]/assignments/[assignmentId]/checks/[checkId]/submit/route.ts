import { NextResponse } from "next/server";

import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { canLaunchRuntimeAssignment, type MembershipAuthContext } from "@/modules/auth/permissions";
import {
  createPrismaKnowledgeCheckRepository,
  type KnowledgeCheckRepository,
} from "@/modules/assessments/prisma-repository";
import { scoreKnowledgeCheck } from "@/modules/assessments/scoring";

export const dynamic = "force-dynamic";

export type SubmitKnowledgeCheckInput = {
  context: MembershipAuthContext;
  organizationId: string;
  assignmentId: string;
  checkId: string;
  selectedAnswerIds: string[];
  submittedAt: Date;
  repository: KnowledgeCheckRepository;
};

export async function submitKnowledgeCheckForLearner(input: SubmitKnowledgeCheckInput) {
  const assignment = await input.repository.findAssignmentForSubmission({
    organizationId: input.organizationId,
    assignmentId: input.assignmentId,
  });

  if (!assignment || !canLaunchRuntimeAssignment(input.context, assignment)) {
    throw new Error("Assignment was not found");
  }

  const check = await input.repository.findCheckForSubmission({
    organizationId: input.organizationId,
    courseId: assignment.courseId,
    checkId: input.checkId,
  });

  if (!check) {
    throw new Error("Knowledge check was not found");
  }

  const score = scoreKnowledgeCheck(check, input.selectedAnswerIds);
  const attempt = await input.repository.createAttempt({
    organizationId: input.organizationId,
    assignmentId: assignment.id,
    questionId: check.id,
    selectedAnswerIds: input.selectedAnswerIds,
    score,
    submittedAt: input.submittedAt,
  });

  return {
    correct: score.correct,
    scorePercent: score.scorePercent,
    attemptNumber: attempt.attemptNumber,
    selectedAnswerFeedback: score.selectedAnswerFeedback,
    explanation: score.explanation,
  };
}

export function parseSelectedAnswerIds(body: unknown): string[] {
  if (!body || typeof body !== "object" || !("selectedAnswerIds" in body)) {
    return [];
  }

  const selectedAnswerIds = (body as { selectedAnswerIds: unknown }).selectedAnswerIds;

  if (!Array.isArray(selectedAnswerIds) || !selectedAnswerIds.every((value) => typeof value === "string")) {
    throw new Error("selectedAnswerIds must be an array");
  }

  return selectedAnswerIds;
}

type RouteContext = {
  params: Promise<{
    slug: string;
    assignmentId: string;
    checkId: string;
  }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const { slug, assignmentId, checkId } = await params;
    const { context, organizationId } = await requireOrganizationMemberBySlug(slug);
    const { prisma } = await import("@/lib/prisma");
    const body = await readRequestBody(request);
    const selectedAnswerIds = parseSelectedAnswerIds(body);
    const result = await submitKnowledgeCheckForLearner({
      context,
      organizationId,
      assignmentId,
      checkId,
      selectedAnswerIds,
      submittedAt: new Date(),
      repository: createPrismaKnowledgeCheckRepository(prisma),
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Knowledge check could not be submitted";

    if (isLoginRedirect(error)) {
      return NextResponse.json({ message: "Authentication required" }, { status: 401 });
    }

    if (isRedirect(error)) {
      return NextResponse.json({ message: "Not allowed to submit this knowledge check" }, { status: 403 });
    }

    const status = message.includes("not found") ? 404 : 400;

    return NextResponse.json({ message }, { status });
  }
}

async function readRequestBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new Error("Knowledge check request body must be valid JSON");
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
