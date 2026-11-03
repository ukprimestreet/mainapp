/**
 * Runs every browser suite, starting the right server for each group and stopping it afterwards.
 *
 * Why this exists. `test:e2e` used to be fifteen suites chained with `&&`, run against whatever server
 * you happened to have started — and they do not all want the same server. Ten of them want the
 * `start:test` configuration (mock postcode service, mock Stripe); the five lead-system suites want
 * `start:e2e`, which disables outbound mail so that what they assert about `emailOutbox` is a queued
 * row rather than a real email to a real address. On top of that, six suites defaulted to port 3417,
 * which nothing in this repository has ever started.
 *
 * The result was a command that could not pass however carefully you ran it, so it stopped being run,
 * and suites rotted quietly: one had been crashing since the writers list became a table, another had
 * been asserting against copy that no longer existed, a third was matching a sitemap string that could
 * never appear. All three were found by running them by hand, which is not a plan.
 *
 * Usage:
 *   node scripts/e2e-all.mjs                     every group
 *   node scripts/e2e-all.mjs --group=web         one group
 *   node scripts/e2e-all.mjs --only=e2e-podcast  one suite, in its own group's server
 *   node scripts/e2e-all.mjs --keep              leave the server running after a failure, to poke at it
 *
 * It does NOT build. Run `npm run build` first; a stale build is the one failure mode this cannot see.
 */
import { spawn, execSync } from "child_process";
import { createWriteStream, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const flag = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split("=").slice(1).join("=");
const only = flag("only");
const wanted = flag("group");
const keep = args.includes("--keep");

const LOGS = join("node_modules", ".cache", "e2e-logs");
mkdirSync(LOGS, { recursive: true });

/** The mock services the suites run themselves listen on 3997–3999; the servers below point at them. */
const GROUPS = [
  {
    name: "web",
    port: 3000,
    env: {
      // e2e-reviews asserts that /admin/outbox says mail is NOT delivered, which is only true with no
      // sender configured — so this group wants mail unconfigured just as the lead-system group does.
      MAIL_DOMAIN: "",
      MAIL_FROM: "",
      POSTCODES_API_BASE: "http://127.0.0.1:3999",
      STRIPE_SECRET_KEY: "sk_test_e2e",
      STRIPE_WEBHOOK_SECRET: "whsec_e2e_test",
      STRIPE_API_BASE: "http://127.0.0.1:3998",
    },
    suites: ["e2e", "e2e-editorial", "e2e-reviews", "e2e-owner", "e2e-payee", "e2e-seo", "e2e-podcast", "e2e-search", "e2e-commerce", "e2e-cities"],
  },
  {
    name: "lead-system",
    port: 3418,
    // Mail deliberately unconfigured: these suites assert on queued outbox rows, and a configured
    // sender would try to deliver test enquiries to real-looking addresses.
    env: { MAIL_DOMAIN: "", MAIL_FROM: "" },
    suites: ["e2e-registration", "e2e-leads", "e2e-matching", "e2e-coverage", "e2e-lead-response"],
  },
  {
    // The two audits want the same server as the web group and run last: a11y creates fixture
    // businesses and episodes, and seo-audit wipes every SeoPage override as part of its own setup.
    // Both clean up after themselves and both exit non-zero on failure, so they belong in this
    // command rather than in two more that somebody has to remember to run.
    name: "audits",
    port: 3000,
    env: { MAIL_DOMAIN: "", MAIL_FROM: "", POSTCODES_API_BASE: "http://127.0.0.1:3999", STRIPE_SECRET_KEY: "sk_test_e2e", STRIPE_WEBHOOK_SECRET: "whsec_e2e_test", STRIPE_API_BASE: "http://127.0.0.1:3998" },
    suites: ["a11y", "seo-audit"],
  },
  {
    name: "credits",
    port: 3418,
    env: { MAIL_DOMAIN: "", MAIL_FROM: "", STRIPE_SECRET_KEY: "sk_test_e2e", STRIPE_WEBHOOK_SECRET: "whsec_e2e_credits", STRIPE_API_BASE: "http://127.0.0.1:3997" },
    suites: ["e2e-credits"],
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Kill a process and everything it spawned. `next start` forks a worker that holds the port. */
function killTree(pid) {
  try { execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" }); }
  catch { try { process.kill(pid, "SIGKILL"); } catch {} }
}

async function freePort(port) {
  try {
    const out = execSync(`powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess"`, { encoding: "utf8" });
    for (const pid of new Set(out.split(/\s+/).filter(Boolean))) killTree(pid);
  } catch {}
  await sleep(500);
}

async function startServer(group) {
  await freePort(group.port);
  const log = createWriteStream(join(LOGS, `server-${group.name}.log`));
  const child = spawn(process.execPath, [join("node_modules", "next", "dist", "bin", "next"), "start", "-p", String(group.port)], {
    env: { ...process.env, ...group.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log); child.stderr.pipe(log);
  const base = `http://localhost:${group.port}`;
  const until = Date.now() + 90000;
  while (Date.now() < until) {
    try { const r = await fetch(base + "/", { redirect: "manual" }); if (r.status < 500) return { child, base }; } catch {}
    if (child.exitCode !== null) break;
    await sleep(700);
  }
  killTree(child.pid);
  throw new Error(`server for group "${group.name}" never came up on ${group.port} — see ${join(LOGS, `server-${group.name}.log`)}`);
}

function runSuite(name, base) {
  return new Promise((resolve) => {
    const out = [];
    const child = spawn(process.execPath, [join("scripts", `${name}.mjs`)], { env: { ...process.env, BASE: base }, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => out.push(d));
    child.on("close", (code) => {
      const text = Buffer.concat(out).toString();
      // Always keep the whole thing. Printing only the last few lines of a crash reliably cuts off the
      // part that says what went wrong — a Prisma error ends with its client version, not its message.
      try { writeFileSync(join(LOGS, name + ".log"), text); } catch {}
      const fails = [...text.matchAll(/^FAIL .*$/gm)].map((m) => m[0]);
      resolve({ name, code, fails, tail: text.trim().split("\n").slice(-1)[0] ?? "", text });
    });
  });
}

const groups = GROUPS
  .filter((g) => (wanted ? g.name === wanted : true))
  .filter((g) => (only ? g.suites.includes(only) : true))
  .map((g) => (only ? { ...g, suites: [only] } : g));

if (groups.length === 0) {
  console.error(only ? `No group contains a suite called "${only}".` : `No group called "${wanted}". Groups: ${GROUPS.map((g) => g.name).join(", ")}.`);
  process.exit(2);
}

const results = [];
for (const group of groups) {
  console.log(`\n=== group ${group.name} (port ${group.port}) ===`);
  let server;
  try { server = await startServer(group); }
  catch (e) { console.error(String(e.message)); results.push({ name: `group ${group.name}`, code: 1, fails: ["server did not start"], tail: "" }); continue; }
  try {
    for (const s of group.suites) {
      process.stdout.write(`  ${s.padEnd(20)}`);
      const r = await runSuite(s, server.base);
      await sleep(1500); // let the previous browser fully exit; Edge has crashed outright when they overlap
      results.push(r);
      console.log(r.code === 0 ? r.tail : `FAILED (exit ${r.code}) ${r.fails.length ? `— ${r.fails.length} assertion(s)` : "— crashed"}`);
      for (const f of r.fails) console.log(`      ${f}`);
      if (r.code !== 0 && !r.fails.length) console.log(r.text.trim().split("\n").slice(-6).map((l) => "      " + l).join("\n"));
    }
  } finally {
    if (!(keep && results.some((r) => r.code !== 0))) killTree(server.child.pid);
    else console.log(`  (left the ${group.name} server running on ${group.port} because --keep was passed)`);
  }
}

const bad = results.filter((r) => r.code !== 0);
console.log(`\n${results.length - bad.length}/${results.length} suites passed.`);
if (bad.length) { console.log(`Failed: ${bad.map((r) => r.name).join(", ")}`); process.exit(1); }
