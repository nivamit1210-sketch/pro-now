#!/usr/bin/env node
/**
 * `npm audit`, scoped to what ships (docs/21 W10).
 *
 * The monorepo shares one lockfile, so `npm audit` reports the Expo apps,
 * the demo, Next.js and test tools alongside the product. What reaches
 * users is the API and the web app: this fails on a high or critical
 * advisory in their production dependency trees, and lists the rest as a
 * note, so the gate means something and stays green only for a reason.
 */
import { execFileSync } from "node:child_process";

const SHIPPED = ["apps/api", "apps/web"];
/**
 * Packages a shipped workspace names but the build replaces, so they never
 * reach a user. `react-native` is aliased to `react-native-web` in
 * apps/web/vite.config.ts; its CLI and Metro (the mobile apps' bundler)
 * come only with the original.
 */
const REPLACED_AT_BUILD = new Set(["react-native"]);
const FAIL_AT = new Set(["high", "critical"]);

function run(args) {
  try {
    return execFileSync("npm", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    // npm exits non-zero when it finds something; the JSON is still on stdout.
    return e.stdout;
  }
}

/*
 * What ships, resolved the way Node resolves it: from each shipped
 * workspace's own `dependencies` (never devDependencies — the build tools
 * run in CI, not in front of users), through each package's
 * `dependencies`, `optionalDependencies` and `peerDependencies`, looking
 * in nested node_modules first and then up the tree.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const shipped = new Set();
const seenDirs = new Set();
function resolveDir(name, fromDir) {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, "node_modules", name);
    if (existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
function visit(pkgDir) {
  if (seenDirs.has(pkgDir)) return;
  seenDirs.add(pkgDir);
  const pkg = JSON.parse(readFileSync(path.join(pkgDir, "package.json"), "utf8"));
  // A peer marked optional is used only when the host installs it itself
  // (better-auth lists next, mysql2, prisma and vitest that way).
  const optionalPeers = new Set(Object.entries(pkg.peerDependenciesMeta ?? {}).filter(([, m]) => m?.optional).map(([n]) => n));
  const peers = Object.fromEntries(Object.entries(pkg.peerDependencies ?? {}).filter(([n]) => !optionalPeers.has(n)));
  const deps = { ...pkg.dependencies, ...pkg.optionalDependencies, ...peers };
  for (const name of Object.keys(deps)) {
    if (REPLACED_AT_BUILD.has(name)) continue;
    const dir = resolveDir(name, pkgDir);
    if (!dir) continue;
    shipped.add(name);
    visit(dir);
  }
}
for (const ws of SHIPPED) visit(path.join(root, ws));

const audit = JSON.parse(run(["audit", "--omit=dev", "--json"]));
const found = Object.values(audit.vulnerabilities ?? {}).filter((v) => shipped.has(v.name));
const blocking = found.filter((v) => FAIL_AT.has(v.severity));
for (const v of found) console.log(`${FAIL_AT.has(v.severity) ? "FAIL" : "note"}  ${v.severity.padEnd(8)} ${v.name}  (${v.range})`);
console.log(`${shipped.size} packages ship; ${found.length} with advisories; ${blocking.length} high or critical.`);
process.exit(blocking.length > 0 ? 1 : 0);
