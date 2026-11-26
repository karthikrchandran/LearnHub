CREATE TABLE "MobileProgressIdempotency" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MobileProgressIdempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MobileProgressIdempotency_scope_key"
ON "MobileProgressIdempotency"("organizationId", "sessionId", "assignmentId", "lessonId", "idempotencyKey");
CREATE INDEX "MobileProgressIdempotency_createdAt_idx" ON "MobileProgressIdempotency"("createdAt");