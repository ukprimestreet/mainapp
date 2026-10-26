/**
 * Creates AdminUser and AdminLoginAttempt, and adds the actor columns to AuditLog.
 *
 * Explicit schema-qualified DDL, additive, idempotent. Default target `dev`; production needs
 * --schema=public explicitly.
 *
 * Nothing is removed. The shared-password login keeps working until individual login has been tested —
 * see docs/admin-accounts.md for how the migration completes itself.
 */
import { PrismaClient } from "@prisma/client";

const tables = (s: string) => {
  const q = (t: string) => `"${s}"."${t}"`;
  return [
    `CREATE TABLE IF NOT EXISTS ${q("AdminUser")} (
      "id" TEXT NOT NULL PRIMARY KEY,
      "email" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'ADMIN',
      "passwordHash" TEXT,
      "active" BOOLEAN NOT NULL DEFAULT true,
      "setupTokenHash" TEXT,
      "setupExpiresAt" TIMESTAMP(3),
      "totpSecretEnc" TEXT,
      "totpConfirmedAt" TIMESTAMP(3),
      "recoveryCodeHashes" TEXT,
      "sessionVersion" INTEGER NOT NULL DEFAULT 1,
      "lastLoginAt" TIMESTAMP(3),
      "createdBy" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "AdminUser_email_key" ON ${q("AdminUser")}("email")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "AdminUser_setupTokenHash_key" ON ${q("AdminUser")}("setupTokenHash")`,
    `CREATE INDEX IF NOT EXISTS "AdminUser_active_idx" ON ${q("AdminUser")}("active")`,

    `CREATE TABLE IF NOT EXISTS ${q("AdminLoginAttempt")} (
      "id" TEXT NOT NULL PRIMARY KEY,
      "emailHash" TEXT NOT NULL,
      "ipHash" TEXT NOT NULL,
      "ok" BOOLEAN NOT NULL DEFAULT false,
      "reason" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS "AdminLoginAttempt_emailHash_createdAt_idx" ON ${q("AdminLoginAttempt")}("emailHash", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "AdminLoginAttempt_ipHash_createdAt_idx" ON ${q("AdminLoginAttempt")}("ipHash", "createdAt")`,

    // Existing audit rows keep NULL actors: before this change there was one shared password and so no
    // identity to record. Pretending otherwise would put a name on an action nobody can attribute.
    `ALTER TABLE ${q("AuditLog")} ADD COLUMN IF NOT EXISTS "actorId" TEXT`,
    `ALTER TABLE ${q("AuditLog")} ADD COLUMN IF NOT EXISTS "actorEmail" TEXT`,
    `ALTER TABLE ${q("AuditLog")} ADD COLUMN IF NOT EXISTS "actorKind" TEXT`,
    `CREATE INDEX IF NOT EXISTS "AuditLog_actorId_idx" ON ${q("AuditLog")}("actorId")`,
    `CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON ${q("AuditLog")}("createdAt")`,

    `ALTER TABLE ${q("AdminUser")} ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE ${q("AdminLoginAttempt")} ENABLE ROW LEVEL SECURITY`,
  ];
};

const fks = (s: string) => [
  ["AuditLog_actorId_fkey",
   `ALTER TABLE "${s}"."AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "${s}"."AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE`],
] as const;

async function apply(schema: string) {
  const db = new PrismaClient({
    datasources: { db: { url: (process.env.DATABASE_URL ?? "").replace("schema=dev", `schema=${schema}`) } },
  });
  console.log(`--- ${schema} ---`);
  for (const sql of tables(schema)) await db.$executeRawUnsafe(sql);
  for (const [name, sql] of fks(schema)) {
    const e = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = $1 AND c.conname = $2`, schema, name);
    if (e[0].n === 0) { await db.$executeRawUnsafe(sql); console.log(`  + ${name}`); }
  }

  const t = await db.$queryRawUnsafe<{ table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name IN ('AdminUser','AdminLoginAttempt') ORDER BY 1`, schema);
  const cols = await db.$queryRawUnsafe<{ column_name: string }[]>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'AuditLog' AND column_name IN ('actorId','actorEmail','actorKind')`, schema);
  const rls = await db.$queryRawUnsafe<{ relname: string; relrowsecurity: boolean }[]>(
    `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = $1 AND c.relname IN ('AdminUser','AdminLoginAttempt')`, schema);
  console.log(`  tables: ${t.length}/2 · AuditLog actor columns: ${cols.length}/3 · RLS: ${rls.filter((r) => r.relrowsecurity).length}/2`);
  const ok = t.length === 2 && cols.length === 3 && rls.length === 2 && rls.every((r) => r.relrowsecurity);
  await db.$disconnect();
  if (!ok) throw new Error(`${schema}: verification failed`);
}

const arg = (process.argv.find((a) => a.startsWith("--schema=")) ?? "--schema=dev").split("=")[1];
const targets = arg === "all" ? ["public", "dev"] : [arg];
if (!targets.every((t) => t === "public" || t === "dev")) throw new Error("Unknown schema: " + arg);
for (const t of targets) await apply(t);
console.log(`Verified: ${targets.join(", ")}.`);
if (!targets.includes("public")) console.log("Production (public) NOT touched. Re-run with --schema=public when authorised.");
