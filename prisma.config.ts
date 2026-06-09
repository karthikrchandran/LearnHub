import "dotenv/config";

import { defineConfig } from "prisma/config";

const localDatabaseUrl = "postgresql://learnhub:learnhub@localhost:5432/learnhub?schema=public";
const databaseUrl =
  process.env["DATABASE_URL"] ??
  (process.env["NODE_ENV"] !== "production" ? localDatabaseUrl : undefined);

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required when running Prisma in production.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
