#!/usr/bin/env node
/**
 * THE BACKUP AND RESTORE DRILL (docs/21 W10, docs/16 §Backup and restore).
 *
 * A backup nobody has restored is a hope. This takes a real dump of the
 * database DATABASE_URL names, restores it into a new, empty database, and
 * proves they match: every table's row count, the migration history, and
 * PostGIS. Then it drops the copy.
 *
 *   DATABASE_URL=postgres://… npm run drill:backup
 *
 * pg_dump / pg_restore come from PATH; when they are older than the
 * server (or missing), set PG_CONTAINER=pro-now-postgres to run them
 * inside the database container instead.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";

const source = process.env.DATABASE_URL;
if (!source) throw new Error("DATABASE_URL is required");
const container = process.env.PG_CONTAINER;
const copyName = `pronow_restore_drill_${Date.now()}`;
const copyUrl = Object.assign(new URL(source), { pathname: `/${copyName}` }).toString();
const dir = mkdtempSync(path.join(tmpdir(), "pronow-drill-"));
const dumpFile = path.join(dir, "pronow.dump");

// Inside a container, localhost is the container itself.
const insideUrl = (u) => (container ? Object.assign(new URL(u), { hostname: "127.0.0.1", port: "5432" }).toString() : u);
const tool = (bin, args) =>
  container ? execFileSync("docker", ["exec", "-i", container, bin, ...args]) : execFileSync(bin, args);

async function facts(url) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  const tables = (await c.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)).rows.map((r) => r.tablename);
  const counts = {};
  for (const t of tables) counts[t] = Number((await c.query(`SELECT count(*)::bigint AS n FROM "${t}"`)).rows[0].n);
  const migrations = (await c.query(`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`)).rows.map((r) => r.migration_name);
  const postgis = (await c.query(`SELECT postgis_lib_version() AS v`)).rows[0].v;
  await c.end();
  return { counts, migrations, postgis };
}

/*
 * A newer pg_dump writes settings an older server does not know (e.g. 17's
 * transaction_timeout), and the restore then fails half-way. Checked first,
 * with the way out, rather than discovered in the middle of a restore.
 */
async function assertToolsMatchServer() {
  if (container) return;
  const tools = Number(execFileSync("pg_dump", ["--version"], { encoding: "utf8" }).match(/(\d+)\./)?.[1]);
  const c = new pg.Client({ connectionString: source });
  await c.connect();
  const server = Math.floor(Number((await c.query("SHOW server_version_num")).rows[0].server_version_num) / 10000);
  await c.end();
  if (tools !== server) {
    console.error(`pg_dump ${tools} does not match the server's PostgreSQL ${server}. Use tools of the same major version, or run them in the database container: PG_CONTAINER=pro-now-postgres npm run drill:backup`);
    process.exit(2);
  }
}

const started = Date.now();
await assertToolsMatchServer();
try {
  console.log(`dumping ${new URL(source).pathname.slice(1)} …`);
  const dump = tool("pg_dump", ["--format=custom", "--no-owner", "--no-privileges", insideUrl(source)]);
  execFileSync("sh", ["-c", `cat > "${dumpFile}"`], { input: dump });
  console.log(`  ${(dump.length / 1024).toFixed(0)} KB`);

  const admin = new pg.Client({ connectionString: source });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${copyName}"`);
  await admin.end();

  console.log(`restoring into ${copyName} …`);
  execFileSync("sh", ["-c", container
    ? `docker exec -i ${container} pg_restore --no-owner --no-privileges --dbname="${insideUrl(copyUrl)}" < "${dumpFile}"`
    : `pg_restore --no-owner --no-privileges --dbname="${copyUrl}" "${dumpFile}"`]);

  const [a, b] = [await facts(source), await facts(copyUrl)];
  const mismatched = Object.keys({ ...a.counts, ...b.counts }).filter((t) => a.counts[t] !== b.counts[t]);
  const rows = Object.values(a.counts).reduce((x, y) => x + y, 0);
  console.log(`  ${Object.keys(a.counts).length} tables, ${rows} rows · migrations ${a.migrations.length} · PostGIS ${b.postgis}`);
  if (mismatched.length || a.migrations.join() !== b.migrations.join() || !b.postgis) {
    console.error(`MISMATCH: ${mismatched.join(", ") || "migrations or PostGIS"}`);
    process.exitCode = 1;
  } else {
    console.log(`RESTORED AND IDENTICAL in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  }
} finally {
  const admin = new pg.Client({ connectionString: source });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${copyName}" WITH (FORCE)`);
  await admin.end();
  rmSync(dir, { recursive: true, force: true });
}
