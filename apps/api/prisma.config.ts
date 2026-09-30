import "./src/load-env.js";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 reads its connection from here rather than from schema.prisma.
 * `url` may be absent: `prisma generate` (CI's checks job) needs no
 * database; migrate and seed fail clearly without one.
 *
 * DIRECT_DATABASE_URL, when set, is what migrations use. On Neon the app's
 * DATABASE_URL is the pooled endpoint (PgBouncer in transaction mode), and
 * migrate's advisory lock needs a direct session (docs/16 §Neon runbook).
 * The running app never reads it.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL,
  },
});
