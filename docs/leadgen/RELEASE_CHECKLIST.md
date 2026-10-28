# Release checklist — the lead system

The system is functionally complete in `dev`. This is the list between that and taking money from real
businesses for real customers' phone numbers.

Run `npm run release:check -- --schema=public` at any point: it reads production and prints this list as
pass/fail, with blockers separated from things that merely work badly. **It reads configuration from the
shell it runs in, not from the deployment** — for the deployment's own settings, call `GET /api/cron` with
the bearer token and read its `config` field.

As of 27 October 2026 production reports **9 blockers**, listed below.

---

## 1. Schema and data (blocked on you)

Nothing in Phase C, D or F exists in production yet. In this order, because the foreign keys need the tables
before them:

```
npx tsx scripts/import-places.ts --schema=public     # 50,371 rows. Place is currently EMPTY
npx tsx scripts/seed-trade-categories.ts --schema=public
npx tsx scripts/seed-category-aliases.ts --schema=public
npm run leads:ddl    -- --schema=public
npm run matching:ddl -- --schema=public
npm run notify:ddl   -- --schema=public
npm run credits:ddl  -- --schema=public
npm run schema:check -- --all
npm run release:check -- --schema=public
```

Every DDL script is additive, idempotent and self-verifying: it checks tables, columns, RLS, constraints and
index predicates before reporting success, and throws rather than reporting a half-applied change.

The places import has been refused four times by the permission layer on this machine, so it needs you to run
it. The first production figure to check afterwards is `Place` — until it is non-zero, `/register` and
`/get-quotes` both render and **neither can be completed**.

## 2. Configuration (blocked on you)

Set in the Vercel project, production environment:

| Variable | Without it |
|---|---|
`CRON_SECRET` (32+ random bytes) | `/api/cron` answers 404 to everybody, so **nothing is ever notified or escalated** |
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | nobody can buy credits past the free five, so the system runs for five leads per business and then stops. The **flow** exists as of 28 October (`/owner/business/[id]/credits`); these two variables are now the only thing missing. No Stripe product or price needs creating: credits are priced in our code at £1 each |

Already set and verified: `DATABASE_URL`, `FIELD_KEY`, `RESEND_API_KEY` with a sending domain,
`IDEAL_POSTCODES_KEY`.

Then schedule the hourly Supabase job — SQL in `SCHEDULED_JOBS.md` — and confirm it with
`select * from cron.job_run_details order by start_time desc limit 5;`.

## 3. Administrator accounts (blocked on you)

Production has **0 active administrator accounts**, which means the shared `ADMIN_PASSWORD` is still the only
way in. That was deliberate during the migration and should not survive launch: an audit log that cannot name
a person is an audit log that cannot answer a dispute.

```
npm run admin:create                 # against production, for each real person
```

Then, once individual logins are tested, remove the shared password — which is the last step of decision D3
and the one still outstanding.

## 4. Supply (a business task, not a code one)

Production reports **0 businesses able to receive a job**: none has both service areas and trades.

No amount of code fixes this. The two-business promise needs roughly **two businesses per trade per
borough** to mean anything; with one, "we send it to a maximum of two" is technically true and practically a
single quote. `/admin/leads` leads with demand we could not service, by trade and area, which is the list to
recruit against once requests start arriving.

**Do not advertise the quote form before there is supply.** A customer who gets nothing from us is a customer
who tells people we do not work, and the form currently tells them the truth instead — which is the right
behaviour and a terrible first impression at scale.

## 5. Legal and privacy (blocked on a qualified adviser)

The privacy notice now describes the lead system in full: what is collected, that it goes to **at most two**
named businesses, what they may do with it, retention, and how to have it deleted. `/privacy` carries the
version string, and every job request stores the version it consented to.

Still needing review before launch, from `LEAD_ROUTING_AND_PRIVACY.md` §12:

1. **The lawful basis for sharing contact details with providers.** This is the one to settle first. The form
   takes explicit, unbundled consent and the notice says so, but whether that is the right basis — and what
   happens when somebody withdraws it after a business already holds their number — is a question for an
   adviser, not for me.
2. The notice wording and the retention schedule.
3. **Business terms for lead credits** — a draft is in `BUSINESS_TERMS_DRAFT.md`, written to match what the
   code actually does. It is a draft for review, not advice.
4. VAT treatment of £1 credits (decision D4). The code already keeps the base price VAT-exclusive and adds
   VAT only when configured to, because Prime Street must not charge VAT before it is registered.
5. Marketing consent wording and the PECR position.
6. Regulated trades — gas, electrical — where advertising rules constrain what a page may imply about
   somebody's qualifications. Nine of the fifty categories are flagged in `SERVICE_RANKING.csv`.

Also outstanding: **SPF, DKIM and DMARC** on the sending domain. Lead emails that land in spam are leads that
were never delivered, and a business that paid for one will say so.

## 6. Retention deletion (not built)

The schedule in §5 of the routing document is a policy, not a job. It needs a `pg_cron` entry and a decision
on anonymising the commercial record rather than deleting it. Nothing breaks without it on day one; it
becomes a promise we are not keeping about three months in.

## 7. Prove it once in production

After 1–3, with one real business and one test request:

- Register a business, approve it, confirm five credits appear.
- Send a quote request through `/get-quotes` as a customer would. Check the confirmation names the business.
- Check the business's own dashboard shows the job, and that opening it is recorded.
- Check the email actually arrived — in the inbox, not in spam.
- Check `/admin/leads/<id>` shows the decisions and the charge.
- Reverse it, confirm the credit comes back, and confirm the customer-facing wording still reads honestly.

Then delete the test request, because a fabricated job in a live system is exactly the sort of thing that
later gets mistaken for real demand.

---

## 8. The SEO audit's existing backlog

`BASE=... node scripts/seo-audit.mjs` reports **10 failures that have nothing to do with the lead system**,
and they were there before this work. Recorded here so they are a decision rather than a surprise:

| Count | What | Why it is not fixed here |
|---|---|---|
4 | meta descriptions over 165 characters on `/guides/*` and `/insights/*` | the text is editorial copy; trimming it is the owner's wording to choose, not mine to quietly rewrite |
2 | titles over 70 characters on two insights pieces | same |
1 | `/businesses/london/cleaning/slice-fixture` has a 21-character description | a test fixture in dev, not a real listing |
3 | `/go/biz/<id>/directions` reported as 404 | an audit artefact: the route 302s correctly to Google Maps, and the audit is following an outbound `rel="nofollow"` link off the site |

Two failures **were** mine and are fixed: `/get-quotes` and `/register` had no `BreadcrumbList`.

One real bug was found while doing this and fixed: every author page's breadcrumb linked to `/authors`,
**which has never existed** and returns 404 in production. There is no authors index, so the breadcrumb is
now plain text rather than a link to nowhere.

---

## What is NOT a blocker, and why

- **The 18 trade categories have no intro copy**, so they are usable for matching and browsing but refused by
  the SEO gate for indexing. That is the gate working. Writing filler to make them rank is the thin-content
  behaviour the brief forbids; somebody has to write something true first.
- **Nearby work reaches nobody** until businesses opt in, by design.
- **No lead detail notifications to the customer when a business is assigned.** The confirmation page names
  them; a second email saying the same thing is noise.
