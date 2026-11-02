/**
 * Phase 2 finance schema: VAT fields on Order (vatPence, vatRateBp, source) and the new Expense table.
 *
 * Explicit, schema-qualified DDL rather than `prisma db push` — see DATABASE_CHANGELOG.md house rule 2.
 * Additive and idempotent: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS throughout, nothing dropped, nothing
 * renamed. `amountPence` and `status` on Order are untouched; existing rows get vatPence=0, vatRateBp=0,
 * source='CHECKOUT' by column default, which is correct — VAT was never charged before this change.
 *
 * Default target is `dev`. Production needs --schema=public explicitly, applied FIRST per house rule 1.
 */
import { PrismaClient } from "@prisma/client";

const statements = (schema: string) => {
  const q = (t: string) => `"${schema}"."${t}"`;
  return [
    `ALTER TABLE ${q("Order")} ADD COLUMN IF NOT EXISTS "vatPence" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE ${q("Order")} ADD COLUMN IF NOT EXISTS "vatRateBp" INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE ${q("Order")} ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'CHECKOUT'`,

    `CREATE TABLE IF NOT EXISTS ${q("Expense")} (
      "id" TEXT NOT NULL PRIMARY KEY,
      "category" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "amountPence" INTEGER NOT NULL,
      "date" TIMESTAMP(3) NOT NULL,
      "recurring" BOOLEAN NOT NULL DEFAULT false,
      "createdBy" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS "Expense_date_idx" ON ${q("Expense")}("date")`,
    `CREATE INDEX IF NOT EXISTS "Expense_category_idx" ON ${q("Expense")}("category")`,

    `ALTER TABLE ${q("Expense")} ENABLE ROW LEVEL SECURITY`,
  ];
};

const NAMES = ["Expense"];

async function apply(schema: string) {
  const db = new PrismaClient({
    datasources: { db: { url: (process.env.DATABASE_URL ?? "").replace("schema=dev", `schema=${schema}`) } },
  });
  console.log(`--- ${schema} ---`);
  for (const sql of statements(schema)) await db.$executeRawUnsafe(sql);

  const cols = await db.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'Order' AND column_name = ANY($2::text[])`,
    schema, ["vatPence", "vatRateBp", "source"]);
  const t = await db.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name = ANY($2::text[])`, schema, NAMES);
  const rls = await db.$queryRawUnsafe<{ relname: string; relrowsecurity: boolean }[]>(
    `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname = ANY($2::text[])`, schema, NAMES);

  console.log(`  Order columns: ${cols.length}/3 · Expense table: ${t.length}/1 · RLS: ${rls.filter((r) => r.relrowsecurity).length}/1`);
  const ok = cols.length === 3 && t.length === 1 && rls.length === 1 && rls[0].relrowsecurity;
  await db.$disconnect();
  if (!ok) throw new Error(`${schema}: verification failed`);
}

const arg = (process.argv.find((a) => a.startsWith("--schema=")) ?? "--schema=dev").split("=")[1];
const targets = arg === "all" ? ["public", "dev"] : [arg];
if (!targets.every((t) => t === "public" || t === "dev")) throw new Error("Unknown schema: " + arg);
for (const t of targets) await apply(t);
console.log(`Verified: ${targets.join(", ")}.`);
if (!targets.includes("public")) console.log("Production (public) NOT touched. Re-run with --schema=public when authorised.");
