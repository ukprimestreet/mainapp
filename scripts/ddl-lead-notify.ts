/**
 * Phase F: the columns notification and escalation need.
 *
 * Three nullable timestamps, all additive. Each exists so that "has this already been sent?" is a fact in a
 * column rather than a guess made by searching email subjects — the thing that decides whether a business
 * gets chased twice, or a customer gets told twice that nobody can help them.
 *
 * Default `dev`; production needs --schema=public.
 */
import { PrismaClient } from "@prisma/client";

const columns = [
  ["LeadAssignment", "notifiedAt"],
  ["LeadAssignment", "remindedAt"],
  ["JobRequest", "customerNotifiedAt"],
] as const;

async function apply(schema: string) {
  const db = new PrismaClient({
    datasources: { db: { url: (process.env.DATABASE_URL ?? "").replace("schema=dev", `schema=${schema}`) } },
  });
  console.log(`--- ${schema} ---`);
  for (const [table, column] of columns) {
    await db.$executeRawUnsafe(`ALTER TABLE "${schema}"."${table}" ADD COLUMN IF NOT EXISTS "${column}" TIMESTAMP(3)`);
  }
  // An index on the one query the chaser runs every time: unopened, unnotified, oldest first.
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "LeadAssignment_notifiedAt_idx" ON "${schema}"."LeadAssignment"("notifiedAt", "deliveredAt")`,
  );

  const found = await db.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
    `SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema = $1 AND (table_name, column_name) IN (('LeadAssignment','notifiedAt'),('LeadAssignment','remindedAt'),('JobRequest','customerNotifiedAt'))`,
    schema,
  );
  const idx = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname = $1 AND indexname = 'LeadAssignment_notifiedAt_idx'`, schema);
  console.log(`  columns: ${found.length}/3 · index: ${idx[0].n}/1`);
  await db.$disconnect();
  if (found.length !== 3 || idx[0].n !== 1) throw new Error(`${schema}: verification failed`);
}

const arg = (process.argv.find((a) => a.startsWith("--schema=")) ?? "--schema=dev").split("=")[1];
const targets = arg === "all" ? ["public", "dev"] : [arg];
if (!targets.every((t) => t === "public" || t === "dev")) throw new Error("Unknown schema: " + arg);
for (const t of targets) await apply(t);
console.log(`Verified: ${targets.join(", ")}.`);
if (!targets.includes("public")) console.log("Production (public) NOT touched. Re-run with --schema=public when authorised.");
