import { describe, expect, it } from "vitest";

import { createPrismaClient } from "./prisma";

describe("Prisma client construction", () => {
  it("constructs and disconnects with the Postgres driver adapter", async () => {
    const prisma = createPrismaClient({
      databaseUrl: "postgresql://learnhub:learnhub@localhost:5432/learnhub?schema=public",
    });

    await expect(prisma.$disconnect()).resolves.toBeUndefined();
  });
});
