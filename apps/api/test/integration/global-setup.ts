import { execFileSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import type { GlobalSetupContext } from "vitest/node";
import "../../src/load-env.js";
import { createPrisma } from "../../src/db/prisma-client.js";

const API_DIR = path.resolve(import.meta.dirname, "../..");

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * One database per run, never the developer's own: the base URL only
 * supplies the server and credentials (TEST_DATABASE_URL, else DATABASE_URL).
 */
export default async function setup({ provide }: GlobalSetupContext) {
  const base = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!base) throw new Error("Integration tests need TEST_DATABASE_URL or DATABASE_URL (see .env.example).");

  const name = `pronow_it_${process.pid}_${Date.now()}`;
  const admin = createPrisma(base);
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);

  const url = new URL(base);
  url.pathname = `/${name}`;
  const databaseUrl = url.toString();

  const env = { ...process.env, DATABASE_URL: databaseUrl };
  execFileSync("npx", ["prisma", "migrate", "deploy"], { cwd: API_DIR, env, stdio: "pipe" });
  execFileSync("npx", ["tsx", "prisma/seed.ts"], { cwd: API_DIR, env, stdio: "pipe" });
  execFileSync("npx", ["tsx", "scripts/sync-streets.ts"], { cwd: API_DIR, env: { ...env, STREETS_SYNC_STRICT: "1" }, stdio: "pipe" });

  provide("databaseUrl", databaseUrl);

  return async () => {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.$disconnect();
  };
}
