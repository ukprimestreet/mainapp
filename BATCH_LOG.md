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

## Batch A2 — Phase A addendum: the master plan, read

**Date:** 26 October 2026
**Authorised by:** owner instruction to re-check for the two reference documents
**Type:** reading and reconciliation. **No code, no pages, no schema change.**

### What was done

Searched beyond the repository and found both documents, now present in `docs/` (placed there after batch A1's search, which is why that pass reported them missing):

| File | Size | Modified | Read how |
|---|---|---|---|
| `docs/UK_Local_Services_Lead_Generation_SEO_Master_Plan.docx` | 53 KB | 25 Oct 23:23 | extracted `word/document.xml`, 469 paragraphs |
| `docs/UK-WIDE LOCAL SERVICES LEAD-GENERATION PLATFORM.txt` | 37 KB | 26 Oct 00:19 | read directly, 1,152 lines |

A copy of the `.docx` also sits in `~/Downloads` alongside a `~$` Word lock file, which means it may be open in Word; the repository copy is byte-identical.

### Verification

- **The `.txt` was diffed against the prompt already in `nextbigprojectforprimestreet.md`** (lines 939–2088). Identical apart from four lines of whitespace handling. **It introduces no instruction that was not already being followed.**
- The `.docx` was read in full before any document was edited.

### What the master plan changed

1. **England first**, with "a documented route to the rest of the UK if later approved" — narrower than the first prompt's "UK-wide", and the shape the data model should be built for.
2. **The 50-category order is stated as a hypothesis**, with named sources to validate against (SearchHawk, PHAM News, Airtasker) and a per-category keyword scope the bare list omitted.
3. **It independently confirms the audit's postcode finding**: "Do not equate postcode areas with neighbourhoods."
4. **It suggests a different pilot area** — Thatcham / Newbury / Wash Common / Speen / Donnington — against this spec's Barking and Dagenham. Recorded as decision **D6** with a comparison table and a recommendation rather than silently overriding either.
5. **Authoritative sources named**: ONS geography, OS Open Names.
6. Confirms the document set for the second project, all of which remain uncreated pending authorisation.

### Files updated

`EXISTING_PLATFORM_AUDIT.md` (§12 rewritten), `LOCATION_AND_LEAD_SYSTEM_SPEC.md` (§8 gains D6), `PROJECT_TODO.md` (A8 completed, D6 added), `projecttodolist.md` (cross-reference), `BATCH_LOG.md` (this entry).

### Open issues

Six owner decisions now gate Phase B: D1 scheduler · D2 address-lookup provider · D3 admin accounts · D4 VAT · D5 registration flow · **D6 pilot area**.

Still outstanding: legal review of the privacy notice, business terms and credit terms before any live lead distribution.

### Recommended next batch

**Either** B1 — geography foundation (`Place` / `PlaceAlias` / `PlaceLink`, back-fill the 83 locations, add `Business.placeId` unread), which needs only D6;

**or** A3 — create the second project's planning documents now that the master plan can be read: `MASTER_PLAN.md`, `SERVICE_RANKING.md`, `GEOGRAPHY_SCHEMA.md`, `LOCATION_MASTER.csv`, `KEYWORD_DATABASE.csv`, `PAGE_QUEUE.csv`, `TECHNICAL_SEO_CHECKLIST.md`, `LEAD_ROUTING_AND_PRIVACY.md`, `SEO_EXPERIMENTS.md`, `CONTENT_BRIEFS/`.

On A3, one commitment: the CSVs would ship with **headers and no invented rows**. Real keyword volumes need Keyword Planner and Search Console access; real locality rows need ONS and OS Open Names imports. I will not populate them from memory, and the master plan forbids it twice.

**Neither is started.**

---

## Batch A3 - Phase A: planning documents and the scheduling decision

**Date:** 26 October 2026
**Authorised by:** owner - “continue”, with the instruction to use the Supabase database for cron jobs Vercel cannot run
**Type:** planning documents and one decision recorded. **No application code, no landing pages, no schema change applied.**

### Decision D1 - settled

**Supabase `pg_cron` for anything Vercel cannot schedule.** Verified on our own instance before writing it down:

| Check | Result |
|---|---|
| `pg_cron` | **1.6.4 available, not installed** |
| `pg_net` | **0.20.4 available, not installed** |
| `http` | 1.6 available (alternative to `pg_net`) |
| Postgres | 17.11 |
| `cron` schema | **absent** - nothing scheduled yet |
| Our DB role | `postgres`, **not** superuser, member of `supabase_privileged_role` |

Division of labour recorded in `docs/leadgen/MASTER_PLAN.md` §6: Vercel keeps the existing daily job; Supabase takes the minute-granularity work (escalation, notification retries). **The immediate-escalation path is built first and needs no scheduler at all** - when matching finds nobody eligible there is nothing to wait for.

Two things flagged rather than assumed: enabling the extensions is an owner action in the Supabase dashboard, and the endpoint secret must live in a Postgres setting or Vault entry, **never in the job definition in plain text**.

### Files created - `docs/leadgen/`

| File | Content | Honest about |
|---|---|---|
| `MASTER_PLAN.md` | Vision, revenue, acquisition, SEO strategy, lead model, architecture, geography, prioritisation, conversion, risks, metrics, current phase | - |
| `GEOGRAPHY_SCHEMA.md` | `Place` / `PlaceAlias` / `PlaceLink` design, source and licence inventory, validation and duplicate rules, migration plan | What postcode lookup can and **cannot** do, verified by live call |
| `LEAD_ROUTING_AND_PRIVACY.md` | Lifecycle, qualification, duplicate and refund rules, matching, PII, retention, security, complaints | States plainly that it **does not establish compliance** and lists what a lawyer must sign off |
| `TECHNICAL_SEO_CHECKLIST.md` | What is already verified working vs what the lead pages need | **No analytics is installed and Search Console is unverified** - so conversion rate cannot be measured today |
| `SEO_EXPERIMENTS.md` | Structure and rules | **Zero entries.** Nothing is published, so no experiment would mean anything |
| `CONTENT_BRIEFS/README.md`, `TEMPLATE.md` | The brief shape | **Zero briefs.** No page is approved |
| `SERVICE_RANKING.csv` | 50 categories with keyword scope, 9 flagged for regulatory review | **All 13 scoring columns empty, every row `UNVERIFIED`.** The order is the master plan hypothesis, not a ranking |
| `LOCATION_MASTER.csv` | **83 real rows** exported from the live database | `gss_code` and `os_id` **deliberately blank** - not yet matched against ONS/OS. `source = PRIMESTREET_EXISTING`, `confidence = MEDIUM` |
| `KEYWORD_DATABASE.csv` | 24-column schema | **Headers only, zero rows.** Real volumes need Keyword Planner and Search Console |
| `PAGE_QUEUE.csv` | 23-column schema | **Headers only, zero rows.** No page is approved or proposed |

### Files updated

`phases.md` - gained a “Lead-generation platform” programme with phases A-G.
`PROJECT_TODO.md` - D1 struck through as decided; A10 and A11 added as completed.
`DATABASE_CHANGELOG.md` - planned batch F records the `pg_cron` work and its secret-handling constraint.

### A deliberate deviation, and why

The master plan asks for `PHASES.md`. **`PHASES.md` and the existing `phases.md` are the same file on Windows** (confirmed: `ls phases.md PHASES.md` resolves both). Creating it would either collide or produce a repository that cannot be checked out cleanly on this machine. The phase plan was therefore appended to `phases.md`, which is also what the master plan instructs for existing equivalents: inspect and update rather than overwrite useful work.

Likewise `MASTER_PLAN.md` and the rest sit in `docs/leadgen/` rather than the repository root, to keep 10 new planning files from burying the four root documents the first prompt named. Paths are stated in every cross-reference.

### Verification

No tests were run because no code changed. The suites stand at 15 unit and 10 e2e, plus the a11y audit. The 83 exported location rows were read from the live database, not transcribed.

### Open issues

**Five owner decisions remain:** D2 address-lookup provider and budget · D3 individual admin accounts · D4 VAT on £1 credits · D5 where registration lives · D6 pilot area (West Berkshire per the master plan, versus Barking and Dagenham per the spec).

**Two capability gaps that will distort the pilot if left:** no analytics provider is installed, and Search Console is not verified. Conversion rate, form-start versus submit, and first-party keyword data are all unavailable until those are fixed. A lead platform that cannot measure conversion cannot be judged.

**Owner actions:** enable `pg_cron` and `pg_net` in the Supabase dashboard; legal review before any live lead distribution; recruit pilot providers.

### Recommended next batch

**B1 - geography foundation.** Create `Place`, `PlaceAlias`, `PlaceLink` with RLS; back-fill all 83 existing locations carrying `legacyLocationId` and verify 100% map; add `Business.placeId` alongside `locationId` **without reading from it**. Additive, reversible, no behaviour change, no pages, and it does not depend on D2, D3 or D4.

It would pair well with matching GSS codes to the 33 London boroughs from ONS, which turns the blank `gss_code` column in `LOCATION_MASTER.csv` into real data and gives Phase B a test fixture.

**Not started.**

---

## Batch B1 — Phase B: England geography acquired from authoritative sources

**Date:** 26 October 2026
**Authorised by:** owner — "continue", with the requirement that every local area in England is covered
**Type:** data acquisition, verification and documentation. **No schema change applied. No landing pages. No application code changed.**

### The requirement, and the one thing I refused to do

The instruction was to cover every local area in England and produce a file of regions, cities, towns, local towns, villages and wards. The only dishonest way to do that would have been to write place names from memory — fabrication across tens of thousands of rows that nobody could audit, and forbidden twice over by the master plan. It was fetched from the ONS Open Geography Portal instead.

### What was produced

`scripts/fetch-england-places.mjs` — idempotent, paginated, retrying, and it **refuses to write a short file**: if the fetched row count does not match the count the server reports, it throws rather than leaving a silently truncated dataset.

| File | Rows | Size | Source |
|---|---|---|---|
| `docs/leadgen/geography/ENGLAND_PLACES.csv` | **70,657** | 16 MB | Index of Place Names in Great Britain, July 2016 (hosted 2022) |
| `docs/leadgen/geography/ENGLAND_ADMIN.csv` | **6,834** | 974 KB | `WD26_LAD26_CTYUA26_RGN26_CTRY26_UK_LU`, 2026 |
| `docs/leadgen/geography/FETCH_SUMMARY.json` | — | 509 B | machine-readable verification record |
| `docs/leadgen/geography/README.md` | — | — | what the files are, the licence, the caveats |

**Coverage:** 43,084 localities (villages, hamlets, named settlements) · 5,376 built-up areas (towns and cities) · 1,797 built-up-area sub-divisions (suburbs) · 11,068 civil parishes · 8,040 wards · 562 non-metropolitan districts · 214 unitary authorities · 178 metropolitan districts · 97 London boroughs · 49 counties · 15 national parks · 9 regions. 48,894 distinct names. **0 rows missing coordinates.**

Current administrative skeleton: **9 regions, 153 counties and unitary authorities, 296 local authorities, 6,834 wards**, every tier with its GSS code.

### Verification

| Check | Result |
|---|---|
| Fetched rows vs server count | 70,657 = 70,657 and 6,834 = 6,834 |
| Rows missing coordinates | **0** |
| Stable pagination | ordered by `objectid` / `ObjectId`, so pages cannot repeat or drop rows |
| Spot checks against the brief | 12 of 14 named places found; the 2 absent are reported below rather than hidden |

### Findings

**1. Four of the nine Dagenham names in the master plan are confirmed; five are not.**

| Name | Result |
|---|---|
| Becontree, Chadwell Heath, Becontree Heath, Marks Gate | **confirmed** localities in Barking and Dagenham |
| Rush Green | exists — **in Havering**, plus three other authorities. Not a Barking and Dagenham locality |
| Castle Green | exists — **in Barnsley, Surrey Heath and Warwick**. Not in Barking and Dagenham |
| Dagenham Dock, Dagenham Green, Beam Park | **not in the index at all** |

This is the caution in the master plan proved right. Dagenham Dock is a real place to anyone who lives there and Beam Park was built after 2016; both need to exist as **aliases with a recorded source**, never invented and never silently promoted to the status of an ONS locality. The alias layer is therefore essential rather than optional.

**2. One in five English place names is ambiguous.** 9,747 of 48,894 names occur in more than one place. There are six Rush Greens. Matching on a name would send a Havering lead to a Hertfordshire business, so everything keys on `place_id` and GSS codes.

**3. A correction to my own spec.** It said Rush Green was administratively in Barking and Dagenham but commonly associated with Romford. Backwards: the locality is in Havering, and what Barking and Dagenham has is a *ward* called "Eastbrook & Rush Green". Corrected, and kept in the document as the worked example of why `PlaceLink` exists.

**4. Two vintages, and only one is authoritative for parentage.** The place index is July 2016; English local government has been reorganised repeatedly since. Names and types come from the places file, current parentage from the admin file, and joining them must **flag** rather than guess where a 2015 LAD code no longer exists.

### Open issues

- **OGL attribution is not yet on the site.** The licence requires it wherever the data is published. It must ship with the first page that uses this data.
- `ENGLAND_PLACES.csv` is 16 MB. Acceptable for reference data that changes rarely, and regenerable with one command, but re-fetches should be deliberate rather than routine.
- Boundaries are not included — one point per place, no polygons. Point-in-polygon locality resolution would need the much larger ONS boundary products.
- Address-level selection still needs licensed data (**D2**).
- Four decisions remain open: **D2** address lookup · **D3** admin accounts · **D4** VAT · **D6** pilot area. D1 is settled (Supabase `pg_cron`); D5 has a recommendation awaiting confirmation.

### Recommended next batch

**B2 — the `Place` tables and the import.** Create `Place` / `PlaceAlias` / `PlaceLink` with RLS; back-fill the 83 existing PrimeStreet locations carrying `legacyLocationId` and verify 100% map; import the administrative skeleton first (9 → 153 → 296 → 6,834, all with GSS codes) because it is small, current and self-verifying; then the settlement layer, flagging rather than guessing every stale parent. Add `Business.placeId` alongside `locationId` **without reading from it**.

Deliberately a separate batch: applying DDL to production in the same breath as a 70,000-row acquisition is how the earlier outage on this project happened. The data is now on disk, verified, and can be imported with the row counts known in advance.

**Not started.**

---

**BATCH COMPLETE. I HAVE STOPPED. I WILL NOT START ANOTHER BATCH UNTIL YOU EXPLICITLY AUTHORISE IT.**
