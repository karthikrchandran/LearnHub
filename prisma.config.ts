import { defineConfig } from "prisma/config";

const localDatabaseUrl = "postgresql://learnhub:learnhub@localhost:5432/learnhub?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"] ?? localDatabaseUrl,
  },
});
