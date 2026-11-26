CREATE TABLE "LoginThrottleBucket" (
    "keyHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginThrottleBucket_pkey" PRIMARY KEY ("keyHash")
);

CREATE INDEX "LoginThrottleBucket_updatedAt_idx" ON "LoginThrottleBucket"("updatedAt");