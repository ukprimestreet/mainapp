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
  // author-docs is private on purpose: a CV belongs to the editors, not the internet.
  const buckets = [
    { id: "business-media", public: true, limit: 5, types: ["image/jpeg", "image/png", "image/webp"] },
    { id: "author-media", public: true, limit: 5, types: ["image/jpeg", "image/png", "image/webp"] },
    { id: "author-docs", public: false, limit: 10, types: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"] },
  ];
  for (const b of buckets) {
    const r = await fetch(`${url}/storage/v1/bucket`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, apikey: key, "content-type": "application/json" },
      body: JSON.stringify({ id: b.id, name: b.id, public: b.public, file_size_limit: b.limit * 1024 * 1024, allowed_mime_types: b.types }),
    });
    console.log(`storage bucket ${b.id} (${b.public ? "public" : "private"}):`, r.status === 200 ? "created" : r.status === 400 || r.status === 409 ? "already exists" : `HTTP ${r.status}`);
  }
}
await db.$disconnect();
