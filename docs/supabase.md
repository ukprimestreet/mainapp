# Supabase (database, security, storage)

## Setup
- **Database:** Supabase Postgres via the IPv4 pooler (`aws-0-eu-west-1.pooler.supabase.com:5432`). `DATABASE_URL` is the runtime connection, `DIRECT_URL` is used by `prisma db push`.
- **Schemas:** dev and tests use `?schema=dev`. Production must use `?schema=public` (or its own schema) — tests delete and re-seed data, so NEVER point them at production.
- **Search:** Postgres full-text (tsvector + GIN) in `src/lib/search/fts.ts`; English stemming, weighted title > tags > body, prefix on the last word.
- **Security:** `npm run db:harden` (idempotent) enables row-level security on every table with no policies, so the public anon key cannot read or write anything through Supabase's REST API. The app connects as the database owner through Prisma, which bypasses RLS. Re-run it after every `db push`. The search table enables RLS itself.
- **Storage:** public-read bucket `business-media` (5 MB, jpeg/png/webp), created by `db:harden`. Uploads must go through server code using `SUPABASE_SERVICE_ROLE_KEY` (never exposed to the browser). Gallery images are currently https URLs; direct upload UI is a later task.

## Keys
`SUPABASE_ANON_KEY` is unused (the browser never talks to Supabase). `SUPABASE_SERVICE_ROLE_KEY` bypasses all security: server only, never `NEXT_PUBLIC_`.

## Production checklist
1. Rotate the database password, anon and service-role keys (they were shared in chat) and the admin password.
2. Create the production schema, `prisma db push`, `npm run db:harden`, load real data (no sample seed).
3. Use the transaction pooler (port 6543, `?pgbouncer=true`) for `DATABASE_URL` on serverless hosts; keep `DIRECT_URL` on 5432.
4. Turn on Supabase backups / point-in-time recovery.

## Raw SQL and the transaction pooler
Through pgbouncer in transaction mode a connection is **not guaranteed** to keep the `search_path` from the connection string. Raw SQL that names a table unqualified can therefore create and query a second copy of it in another schema, and search starts losing rows at random. Every raw statement in `src/lib/search/fts.ts` names its schema explicitly (taken from `DATABASE_URL`), and `ftsPrune()` removes index rows whose document has gone. Prisma's own queries are unaffected.

Dev and tests run against the pooler on port 6543 (`pgbouncer=true&connection_limit=5`). Occasional "Server has closed the connection" errors are the pooler reaping idle connections; re-run the suite.
