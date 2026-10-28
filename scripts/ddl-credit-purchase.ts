/**
 * Phase E: the columns buying lead credits needs on `Order`.
 *
 * `quantity` is new. `vatPence`, `vatRateBp` and `source` are **drift I created** in an earlier batch by
 * committing the parallel finance work's schema models without their DDL: they are in `schema.prisma` and in
 * `dev`, and production does not have them. `scripts/ddl-finance.ts` also adds those three, as part of a
 * larger change that includes `Expense`; both scripts use ADD COLUMN IF NOT EXISTS, so running either or
 * both in any order is safe.
 *
 * This script exists so that the credit purchase flow's production dependency is self-contained: nothing
 * here waits on somebody else's uncommitted work.
 *
 * Default `dev`; production needs --schema=public.
 */
import { PrismaClient } from "@prisma/client";

const columns = [
  [`"quantity" INTEGER NOT NULL DEFAULT 1`, "quantity"],
  [`"vatPence" INTEGER NOT NULL DEFAULT 0`, "vatPence"],
  [`"vatRateBp" INTEGER NOT NULL DEFAULT 0`, "vatRateBp"],
  [`"source" TEXT NOT NULL DEFAULT 'CHECKOUT'`, "source"],
] as const;

async function apply(schema: string) {
  const db = new PrismaClient({
    datasources: { db: { url: (process.env.DATABASE_URL ?? "").replace("schema=dev", `schema=${schema}`) } },
  });
  console.log(`--- ${schema} ---`);
  for (const [ddl] of columns) {
    await db.$executeRawUnsafe(`ALTER TABLE "${schema}"."Order" ADD COLUMN IF NOT EXISTS ${ddl}`);
  }

  const found = await db.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'Order' AND column_name = ANY($2::text[])`,
    schema, columns.map(([, name]) => name),
  );
  console.log(`  Order columns: ${found.length}/${columns.length} (${found.map((f) => f.column_name).join(", ")})`);
  await db.$disconnect();
  if (found.length !== columns.length) throw new Error(`${schema}: verification failed`);
}

const arg = (process.argv.find((a) => a.startsWith("--schema=")) ?? "--schema=dev").split("=")[1];
const targets = arg === "all" ? ["public", "dev"] : [arg];
if (!targets.every((t) => t === "public" || t === "dev")) throw new Error("Unknown schema: " + arg);
for (const t of targets) await apply(t);
console.log(`Verified: ${targets.join(", ")}.`);
if (!targets.includes("public")) console.log("Production (public) NOT touched. Re-run with --schema=public when authorised.");
