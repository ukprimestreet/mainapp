/**
 * Phase F, second pass: what the business told us it was doing.
 *
 * Two additive, nullable columns. They exist because `deliveredAt` was being used as a proxy for "they are
 * dealing with it", and it is not one: a trade who reads the email on a phone and rings the customer
 * immediately never opens a dashboard, and escalation took the job back off them at 24 hours. The proxy
 * punished the best possible behaviour.
 *
 * Default `dev`; production needs --schema=public.
 */
import { PrismaClient } from "@prisma/client";

const columns = [
  [`"respondedAt" TIMESTAMP(3)`, "respondedAt"],
  [`"responseKind" TEXT`, "responseKind"],
] as const;

async function apply(schema: string) {
  const db = new PrismaClient({
    datasources: { db: { url: (process.env.DATABASE_URL ?? "").replace("schema=dev", `schema=${schema}`) } },
  });
  console.log(`--- ${schema} ---`);
  for (const [ddl] of columns) {
    await db.$executeRawUnsafe(`ALTER TABLE "${schema}"."LeadAssignment" ADD COLUMN IF NOT EXISTS ${ddl}`);
  }
  // The escalation query reads these every hour: unresponded, not opened, oldest first.
  await db.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "LeadAssignment_respondedAt_idx" ON "${schema}"."LeadAssignment"("respondedAt", "status")`,
  );

  const found = await db.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'LeadAssignment' AND column_name = ANY($2::text[])`,
    schema, columns.map(([, n]) => n),
  );
  const idx = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname = $1 AND indexname = 'LeadAssignment_respondedAt_idx'`, schema);
  console.log(`  columns: ${found.length}/2 · index: ${idx[0].n}/1`);
  await db.$disconnect();
  if (found.length !== 2 || idx[0].n !== 1) throw new Error(`${schema}: verification failed`);
}

const arg = (process.argv.find((a) => a.startsWith("--schema=")) ?? "--schema=dev").split("=")[1];
const targets = arg === "all" ? ["public", "dev"] : [arg];
if (!targets.every((t) => t === "public" || t === "dev")) throw new Error("Unknown schema: " + arg);
for (const t of targets) await apply(t);
console.log(`Verified: ${targets.join(", ")}.`);
if (!targets.includes("public")) console.log("Production (public) NOT touched. Re-run with --schema=public when authorised.");
