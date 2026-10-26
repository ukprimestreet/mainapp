# Batch log

One entry per authorised batch. Records what was inspected or changed, what was tested, what was decided, and what is still open. No batch starts without explicit authorisation; no batch is recorded as complete without verification.

---

## Batch A1 — Phase A: audit and architecture

**Date:** 26 October 2026
**Authorised by:** owner, via `nextbigprojectforprimestreet.md` §21 ("Start with Phase A only")
**Type:** audit and documentation. **No application code was written. No landing pages were created. No schema change was applied.**

### What was done

A direct inspection of the platform — repository, Prisma schema, live Supabase database (both `dev` and `public`), the running production deployment and the hosting configuration — followed by four documents.

### Files created

| File | What it is |
|---|---|
| `EXISTING_PLATFORM_AUDIT.md` | What the platform is today, verified: stack, registration routes, location data, the existing enquiry system, payments, roles, notifications, tests, deployment, and what production actually contains |
| `LOCATION_AND_LEAD_SYSTEM_SPEC.md` | Proposed geography model, lead model, matching engine, credit ledger, admin surface, privacy position, pilot recommendation, and the five decisions that gate Phase B |
| `DATABASE_CHANGELOG.md` | House rules for schema changes, the existing change history, and the planned (unapplied) lead-system migrations with their rollback position |
| `PROJECT_TODO.md` | Phase A–G task list with honest statuses, the five blocking decisions, and a risk register |

### Files not created, and why

- **`MASTER_PLAN.md`, `PHASES.md`** — equivalents already exist as `phases.md` and `projecttodolist.md`. The prompt says to update existing equivalents rather than create duplicates (prompt 2, §4).
- **`SERVICE_RANKING.md`, `KEYWORD_DATABASE.csv`, `PAGE_QUEUE.csv`, `GEOGRAPHY_SCHEMA.md`, `LOCATION_MASTER.csv`, `CONTENT_BRIEFS/`, `SEO_EXPERIMENTS.md`, `TECHNICAL_SEO_CHECKLIST.md`, `LEAD_ROUTING_AND_PRIVACY.md`** — these belong to the **second** project in the prompt (the standalone UK-wide lead-generation site). Its own §2 requires reading `UK_Local_Services_Lead_Generation_SEO_Master_Plan.docx` **first**, and that document is not in the repository. Creating its planning documents before reading its master plan would mean inventing the plan. Blocked pending the file.

### Verification performed

| Check | Result |
|---|---|
| Model count and schema parity | 54 models; `public` and `dev` in step |
| Geography scale | 1 city (london, LIVE), 83 locations (33 BOROUGH + 50 NEIGHBOURHOOD, 50 parented), 12 flat categories |
| What postcodes.io returns | **Live call**, `RM10 7AA`: country, region, `admin_district` "Barking and Dagenham" (E09000002), `admin_ward` "Eastbrook & Rush Green", parish, GSS codes, lat/lng. **No town, no locality** |
| Payment readiness in production | `vercel env ls production` — **no Stripe variables**; all 4 `Product` rows £0 and `active = false` |
| Scheduling granularity | Vercel plan **Hobby** → crons daily only; one job exists (`/api/cron`, 09:30 UTC, `CRON_SECRET`-gated) |
| Production content | 3 businesses, 6 articles, 9 search documents, **0 owners**, 0 subscribers, 0 automations enabled |
| Existing enquiry system | `Lead` is single-recipient and Premium-gated; anti-abuse controls catalogued for reuse |
| Master plan document | Searched the whole tree — **not present** |

No tests were run because no code changed. The suites stand as they were: 15 unit, 10 e2e, plus the a11y audit.

### Findings that change the plan

1. **The 3-minute escalation is not achievable on the current hosting plan.** Hobby crons run daily. Decision D1.
2. **Stripe is not live in production**, so credit purchasing cannot ship until keys and real prices exist.
3. **There are no individual admin accounts** — one shared password — so role-based restriction of customer contact details (prompt §10) and per-admin audit attribution are impossible today. Decision D3.
4. **The geography model is city-first and London-shaped.** UK-wide coverage is a redesign, not a widening, and 83 existing rows plus indexed URLs must survive it.
5. **Postcode → locality is unsolved**, and postcode → *selectable address* needs licensed, paid data. Decision D2.
6. **`Lead` is single-recipient**, `areasServed` is free text, and a business can hold only one category. All three need structural change while live features keep working.
7. **Production has no provider supply.** This reorders the pilot: recruit providers first, then open the form.
8. **Strong and directly reusable**: the Stripe pipeline (signed webhooks + `StripeEvent` idempotency), the existing enquiry form's anti-abuse controls, the email/outbox infrastructure, the automations pattern (off by default, capped, dry-runnable), the dashboard system, `secretbox.ts`, and `AuditLog`.

### Open issues requiring an owner decision

D1 scheduler · D2 address-lookup provider and budget · D3 individual admin accounts · D4 VAT on £1 credits · D5 where registration lives. All five are set out with recommendations in `LOCATION_AND_LEAD_SYSTEM_SPEC.md` §2.

Also outstanding: `UK_Local_Services_Lead_Generation_SEO_Master_Plan.docx`, and legal review of the privacy notice, business terms and credit terms before any live distribution.

### Recommended next batch

**Batch B1 — geography foundation**, and nothing else: create `Place` / `PlaceAlias` / `PlaceLink`, back-fill the 83 existing locations with verification that every row maps, and add `Business.placeId` alongside `locationId` without reading from it yet. Additive only, reversible, no behaviour change, no pages.

It does not depend on D1, D2 or D4. It would be the safest first code change.

**Not started, and will not be, without authorisation.**

---

**BATCH COMPLETE. I HAVE STOPPED. I WILL NOT START ANOTHER BATCH UNTIL YOU EXPLICITLY AUTHORISE IT.**
