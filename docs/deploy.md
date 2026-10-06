# Deploying PrimeStreet (Vercel + Supabase)

Repo: `github.com/ukprimestreet/mainapp` (branch `main`). Vercel project: `primestreet` (region `dub1`, co-located with the Supabase project in `eu-west-1`).

## Environments
| | Schema | Site URL |
|---|---|---|
| Production | `public` | https://primestreet.uk |
| Preview | `dev` | the generated `*.vercel.app` URL |

`DATABASE_URL` uses the **transaction pooler** (port 6543, `pgbouncer=true&connection_limit=1`) because serverless functions open many short-lived connections. `DIRECT_URL` uses port 5432 and is only used by `prisma db push`.

## First deploy
1. **Environment variables.** The exact values are in `.env.vercel.production` and `.env.vercel.preview` (git-ignored, created locally). Add them in Vercel → Settings → Environment Variables, or run `vercel env add <NAME> <target>` for each. `SESSION_SECRET` differs per environment by design; changing it signs everyone out.
2. **Create the production schema:**
   ```
   DATABASE_URL="…?schema=public" DIRECT_URL="…?schema=public" npx prisma db push
   DATABASE_URL="…?schema=public" npm run db:seed:reference   # city, 33 boroughs, categories, £0 inactive products
   DATABASE_URL="…?schema=public" npm run db:harden           # RLS on every table + storage bucket
   ```
   Never run `npm run db:seed` against production: it creates fictional sample businesses and wipes existing content.
3. **Deploy:** `vercel` for a preview, `vercel --prod` for production. Pushes to `main` deploy automatically once the repo is connected in Vercel.
4. **Domain:** add `primestreet.uk` in Vercel → Domains and point the DNS records it shows.

## After deploy
- Stripe: add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, create the Prices, paste the Price ids in `/admin/commerce`, and register the webhook at `https://primestreet.uk/api/stripe/webhook`.
- Email: verify a sending domain in Resend, then set `MAIL_FROM` (until then nothing is sent; everything is still recorded in the outbox).
- Search Console / Bing: add the verification tokens.
- Turn on Supabase point-in-time recovery.

## Security
Rotate anything that has been shared in chat: the Supabase database password, anon and service-role keys, the Resend key and the admin password. `.env*` files are git-ignored and must never be committed.
