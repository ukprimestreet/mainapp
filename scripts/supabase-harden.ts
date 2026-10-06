// Idempotent. Locks every table in the current schema behind row-level security (no policies = the public anon/authenticated API
// can read and write NOTHING; the app connects as the database owner via Prisma, which bypasses RLS), then ensures the storage bucket.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const schema = new URL(process.env.DATABASE_URL!).searchParams.get("schema") ?? "public";
const tables = await db.$queryRawUnsafe<{ tablename: string }[]>("SELECT tablename FROM pg_tables WHERE schemaname = $1", schema);
for (const { tablename } of tables) await db.$executeRawUnsafe(`ALTER TABLE "${schema}"."${tablename}" ENABLE ROW LEVEL SECURITY`);
const off = await db.$queryRawUnsafe<{ n: bigint }[]>("SELECT count(*) AS n FROM pg_tables WHERE schemaname = $1 AND NOT rowsecurity", schema);
console.log(`RLS enabled on ${tables.length} tables in "${schema}"; ${Number(off[0].n)} without RLS`);
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && key) {
  const r = await fetch(`${url}/storage/v1/bucket`, { method: "POST", headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": "application/json" },
    body: JSON.stringify({ id: "business-media", name: "business-media", public: true, file_size_limit: 5 * 1024 * 1024, allowed_mime_types: ["image/jpeg", "image/png", "image/webp"] }) });
  console.log("storage bucket business-media:", r.status === 200 ? "created" : r.status === 400 || r.status === 409 ? "already exists" : `HTTP ${r.status}`);
}
await db.$disconnect();
