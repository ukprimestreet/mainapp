/**
 * Phase 5 sales CRM schema: stage pipeline fields on SalesEnquiry (assignedToId, followUpAt, closedAt).
 *
 * Explicit, schema-qualified DDL rather than `prisma db push` — see DATABASE_CHANGELOG.md house rule 2.
 * Additive and idempotent: ADD COLUMN IF NOT EXISTS throughout, nothing dropped, nothing renamed. Existing
 * rows get assignedToId/followUpAt/closedAt = NULL, which is correct — no enquiry has ever had an owner,
 * a follow-up date or a closed timestamp recorded before this change. `status` (NEW/CONTACTED/WON/LOST)
 * is untouched and remains the source of truth for pipeline stage.
 *
 * Default target is `dev`. Production needs --schema=public explicitly, applied FIRST per house rule 1.
 */
import { PrismaClient } from "@prisma/client";

const statements = (schema: string) => {
  const q = (t: string) => `"${schema}"."${t}"`;
  return [
    `ALTER TABLE ${q("SalesEnquiry")} ADD COLUMN IF NOT EXISTS "assignedToId" TEXT`,
    `ALTER TABLE ${q("SalesEnquiry")} ADD COLUMN IF NOT EXISTS "followUpAt" TIMESTAMP(3)`,
    `ALTER TABLE ${q("SalesEnquiry")} ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP(3)`,
    `CREATE INDEX IF NOT EXISTS "SalesEnquiry_assignedToId_idx" ON ${q("SalesEnquiry")}("assignedToId")`,
  ];
};

async function apply(schema: string) {
  const db = new PrismaClient({
    datasources: { db: { url: (process.env.DATABASE_URL ?? "").replace("schema=dev", `schema=${schema}`) } },
  });
  console.log(`--- ${schema} ---`);
  for (const sql of statements(schema)) await db.$executeRawUnsafe(sql);

  const cols = await db.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'SalesEnquiry' AND column_name = ANY($2::text[])`,
    schema, ["assignedToId", "followUpAt", "closedAt"]);

  console.log(`  SalesEnquiry columns: ${cols.length}/3`);
  const ok = cols.length === 3;
  await db.$disconnect();
  if (!ok) throw new Error(`${schema}: verification failed`);
}

const arg = (process.argv.find((a) => a.startsWith("--schema=")) ?? "--schema=dev").split("=")[1];
const targets = arg === "all" ? ["public", "dev"] : [arg];
if (!targets.every((t) => t === "public" || t === "dev")) throw new Error("Unknown schema: " + arg);
for (const t of targets) await apply(t);
console.log(`Verified: ${targets.join(", ")}.`);
if (!targets.includes("public")) console.log("Production (public) NOT touched. Re-run with --schema=public when authorised.");
