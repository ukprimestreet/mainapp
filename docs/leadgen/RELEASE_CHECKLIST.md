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
npm run response:ddl -- --schema=public
npm run geo:intros   -- --schema=public
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
- Follow the one-click link in the lead email and press "I have contacted the customer"; confirm the job stays and no credit is refunded.
- Send a quote request through `/get-quotes` as a customer would. Check the confirmation names the business.
- Check the business's own dashboard shows the job, and that opening it is recorded.
- Check the email actually arrived — in the inbox, not in spam.
- Check `/admin/leads/<id>` shows the decisions and the charge.
- Reverse it, confirm the credit comes back, and confirm the customer-facing wording still reads honestly.

Then delete the test request, because a fabricated job in a live system is exactly the sort of thing that
later gets mistaken for real demand.

---

## 8. The SEO audit's backlog — cleared

This section used to list ten failures that predated the lead system and were being carried as a known
decision. They are gone, and three of them were never real:

| What | Outcome |
|---|---|
4 meta descriptions over 165 characters, 2 titles over 70 | shortened; same claims, fewer words. The wording was the owner's to choose, so it was carried rather than quietly rewritten — it is rewritten now and the originals are in the history |
`/businesses/london/cleaning/slice-fixture` at 21 characters | the a11y fixture is published and not marked as sample, so the audit crawled it like a real profile. It now carries a description that passes the same check a real listing has to |
3 × `/go/biz/<id>/directions` reported as 404 | **not a real failure.** The audit followed an outbound redirect by taking `.pathname` of the maps URL and re-requesting it against our own host, so a working link was reported as a 404 on a path we never had |
2 titles "over 70 characters" | **not real either.** Titles were measured as raw HTML, so an apostrophe counted as the six characters of `&#x27;` and a 67-character title failed at 73 |

**`npm run test:seo` now passes**, with one warning (a fixture title at 62 characters, over the 60-character
preference but inside the limit). That matters more than the lines it removed: a permanently red suite
cannot tell you when something new breaks.

Two failures were mine and were fixed earlier: `/get-quotes` and `/register` had no `BreadcrumbList`.

One real bug was found while doing that and fixed: every author page's breadcrumb linked to `/authors`,
**which has never existed** and returns 404 in production. There is no authors index, so the breadcrumb is
now plain text rather than a link to nowhere.

## 9. Running the suites

`npm run test:unit` runs every unit suite in one chain and passes.

`npm run test:e2e` starts the right server for each group, runs its suites against it, stops it, and
exits non-zero if any failed — eighteen checks in all, including the accessibility sweep and the SEO
audit, so `test:a11y` and `test:seo` are no longer things to remember separately. It does **not** build:
run `npm run build` first, because a stale build is the one failure it cannot see. Useful forms:
`--group=web`, `--group=audits`, `--only=e2e-podcast`, `--keep` (leaves the server up after a failure).
Every suite's full output is written to `node_modules/.cache/e2e-logs/`.

There are four server configurations, which is why one chained command could never work:

| Group | Port | Why it differs |
|---|---|---|
web | 3000 | mock postcode service and mock Stripe |
lead-system | 3418 | outbound mail deliberately unconfigured, so what the suites assert about `emailOutbox` is a queued row rather than a real email to a real-looking address |
credits | 3418 | the credit-purchase Stripe mock, on a different port from the commerce one |
audits | 3000 | same as web, but run last: `a11y` creates fixtures and `seo-audit` wipes every `SeoPage` override during its own setup |

Before this, `test:e2e` chained all fifteen against whatever server you had started, and six of them
defaulted to port **3417, which nothing in this repository has ever started**. `start:test` did not
disable mail either, which fails `e2e-reviews` on its own terms. The command could not pass however
carefully it was run, so it stopped being run, and suites rotted: one had been crashing since the admin
writers list became a table, one was asserting against copy that no longer existed, one was matching a
sitemap string that could never appear.

Running them **in sequence** then found six more assertions that were only ever true when a suite ran
alone — fixed sleeps that were long enough by themselves, an admin-login lockout the suite tripped on
itself, product fixtures three unit suites never deleted, and one assertion that required the first
search suggestion to be London's when the same suite had just created a second city with an area of the
same name. Not one of them was a product bug.

**What is not fixed:** the browser suites share one dev database and are not isolated from each other.
Six couplings were found and fixed; there is no claim that there are no more. What has changed is that
they are now visible — the command runs, so the next coupling shows up as a failure rather than as a
suite nobody runs.

---

## What is NOT a blocker, and why

- ~~The 18 trade categories have no intro copy~~ — **done, 1 November 2026.** All 18 have real intros and are
  indexable. They need running against production: `npm run geo:intros -- --schema=public`.
- **Nearby work reaches nobody** until businesses opt in, by design.
- **No lead detail notifications to the customer when a business is assigned.** The confirmation page names
  them; a second email saying the same thing is noise.
