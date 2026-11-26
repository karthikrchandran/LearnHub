import { describe, expect, it, vi } from "vitest";

import {
  claimMobileProgressRequest,
  completeMobileProgressRequest,
  hashMobileProgressRequest,
  releaseMobileProgressClaim,
} from "./progress-idempotency";

const scope = {
  organizationId: "org-1",
  sessionId: "session-1",
  assignmentId: "assignment-1",
  lessonId: "lesson-1",
  idempotencyKey: "operation-1",
  requestHash: hashMobileProgressRequest({ lessonId: "lesson-1", positionSecond: 20, watchedSecond: 20 }),
};

describe("mobile progress idempotency claims", () => {
  it("claims a new key before any progress mutation", async () => {
    const create = vi.fn(async () => ({ id: "record-1" }));
    const client = { mobileProgressIdempotency: { create } } as never;

    await expect(claimMobileProgressRequest(client, scope)).resolves.toEqual({ state: "claimed" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ ...scope, response: { state: "PENDING" } }),
    }));
  });

  it("replays a completed response for the same request", async () => {
    const response = { courseProgressPercent: 50, completed: false };
    const client = {
      mobileProgressIdempotency: {
        create: vi.fn(async () => { throw { code: "P2002" }; }),
        findUnique: vi.fn(async () => ({ ...scope, createdAt: new Date(), response })),
      },
    } as never;

    await expect(claimMobileProgressRequest(client, scope)).resolves.toEqual({ state: "completed", response });
  });

  it("rejects reusing a key with a different request body", async () => {
    const client = {
      mobileProgressIdempotency: {
        create: vi.fn(async () => { throw { code: "P2002" }; }),
        findUnique: vi.fn(async () => ({ ...scope, requestHash: "different-hash", createdAt: new Date(), response: { state: "PENDING" } })),
      },
    } as never;

    await expect(claimMobileProgressRequest(client, scope)).rejects.toThrow("different request");
  });

  it("returns pending while another request owns a current lease", async () => {
    const client = {
      mobileProgressIdempotency: {
        create: vi.fn(async () => { throw { code: "P2002" }; }),
        findUnique: vi.fn(async () => ({ ...scope, createdAt: new Date(), response: { state: "PENDING" } })),
      },
    } as never;

    await expect(claimMobileProgressRequest(client, scope)).resolves.toEqual({ state: "pending" });
  });

  it("reclaims an expired pending lease once", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const client = {
      mobileProgressIdempotency: {
        create: vi.fn(async () => { throw { code: "P2002" }; }),
        findUnique: vi.fn(async () => ({ ...scope, createdAt: new Date(0), response: { state: "PENDING" } })),
        updateMany,
      },
    } as never;

    await expect(claimMobileProgressRequest(client, scope, new Date())).resolves.toEqual({ state: "claimed" });
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it("completes and releases only matching pending records", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const deleteMany = vi.fn(async () => ({ count: 1 }));
    const client = { mobileProgressIdempotency: { updateMany, deleteMany } } as never;

    await completeMobileProgressRequest(client, { ...scope, response: { courseProgressPercent: 100 } });
    await releaseMobileProgressClaim(client, scope);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { response: { courseProgressPercent: 100 } } }));
    expect(deleteMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ response: { equals: { state: "PENDING" } } }) }));
  });
});