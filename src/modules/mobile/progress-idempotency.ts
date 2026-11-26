import { createHash } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

export function hashMobileProgressRequest(input: {
  lessonId: string;
  positionSecond: number;
  watchedSecond: number;
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

const pendingResponse = { state: "PENDING" } as const;
const pendingLeaseMilliseconds = 2 * 60 * 1000;

export type MobileProgressIdempotencyClaim =
  | { state: "claimed" }
  | { state: "pending" }
  | { state: "completed"; response: Prisma.JsonValue };

export async function claimMobileProgressRequest(
  client: PrismaClient,
  input: { organizationId: string; sessionId: string; assignmentId: string; lessonId: string; idempotencyKey: string; requestHash: string },
  now = new Date(),
): Promise<MobileProgressIdempotencyClaim> {
  const unique = idempotencyUnique(input);

  try {
    await client.mobileProgressIdempotency.create({
      data: { ...input, response: pendingResponse },
      select: { id: true },
    });

    return { state: "claimed" };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }
  }

  const existing = await client.mobileProgressIdempotency.findUnique({
    where: { organizationId_sessionId_assignmentId_lessonId_idempotencyKey: unique },
    select: { id: true, createdAt: true, requestHash: true, response: true },
  });

  if (!existing) {
    throw new Error("Unable to read mobile progress idempotency record");
  }

  if (existing.requestHash !== input.requestHash) {
    throw new Error("Idempotency key was already used for a different request");
  }

  if (!isPendingResponse(existing.response)) {
    return { state: "completed", response: existing.response };
  }

  const leaseExpired = existing.createdAt.getTime() <= now.getTime() - pendingLeaseMilliseconds;

  if (leaseExpired) {
    const reclaimed = await client.mobileProgressIdempotency.updateMany({
      where: {
        organizationId: input.organizationId,
        sessionId: input.sessionId,
        assignmentId: input.assignmentId,
        lessonId: input.lessonId,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        createdAt: { lte: new Date(now.getTime() - pendingLeaseMilliseconds) },
        response: { equals: pendingResponse },
      },
      data: { createdAt: now },
    });

    if (reclaimed.count === 1) {
      return { state: "claimed" };
    }
  }

  return { state: "pending" };
}

export async function completeMobileProgressRequest(
  client: PrismaClient,
  input: { organizationId: string; sessionId: string; assignmentId: string; lessonId: string; idempotencyKey: string; requestHash: string; response: Prisma.InputJsonValue },
): Promise<void> {
  const completed = await client.mobileProgressIdempotency.updateMany({
    where: {
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      assignmentId: input.assignmentId,
      lessonId: input.lessonId,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      response: { equals: pendingResponse },
    },
    data: { response: input.response },
  });

  if (completed.count !== 1) {
    throw new Error("Unable to complete mobile progress idempotency record");
  }
}

export async function releaseMobileProgressClaim(
  client: PrismaClient,
  input: { organizationId: string; sessionId: string; assignmentId: string; lessonId: string; idempotencyKey: string; requestHash: string },
): Promise<void> {
  await client.mobileProgressIdempotency.deleteMany({
    where: { ...input, response: { equals: pendingResponse } },
  });
}

function idempotencyUnique(input: { organizationId: string; sessionId: string; assignmentId: string; lessonId: string; idempotencyKey: string }) {
  return {
    organizationId: input.organizationId,
    sessionId: input.sessionId,
    assignmentId: input.assignmentId,
    lessonId: input.lessonId,
    idempotencyKey: input.idempotencyKey,
  };
}

function isPendingResponse(response: Prisma.JsonValue): boolean {
  return typeof response === "object" && response !== null && !Array.isArray(response) && response.state === "PENDING";
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}