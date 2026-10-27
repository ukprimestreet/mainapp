# Project todo — location-aware registration, lead distribution and lead credits

**Scope:** this file tracks the lead-generation extension only. Platform-wide history (phases 1–11: directory, reviews, claiming, SEO engine, podcast, search, commerce, multi-city, dashboards) lives in `projecttodolist.md` and `phases.md`, which remain the source of truth for everything already built. Kept separate deliberately so the lead project's state is readable at a glance; cross-referenced rather than duplicated.

**Status vocabulary:** `NOT STARTED` · `IN PROGRESS` · `BLOCKED` · `AWAITING APPROVAL` · `COMPLETED` · `REQUIRES REVISION`

**Rule:** nothing is marked `COMPLETED` until it has been built **and verified**. A mock-up, a UI with no backend, or a feature whose payment/security/notification logic is missing is not complete.

---

## Phase A — audit and architecture

| # | Task | Status |
|---|---|---|
| A1 | Audit registration, location fields, categories, reviews, payments, notifications, roles, tests, deployment | **COMPLETED** — `EXISTING_PLATFORM_AUDIT.md`, verified against the live DB and deployment |
| A2 | Verify what postcodes.io actually returns (not from memory) | **COMPLETED** — live call recorded in the audit, §3 |
| A3 | Confirm scheduling granularity available on the current hosting plan | **COMPLETED** — Vercel **Hobby**, crons daily only. Blocks the 3-minute escalation |
| A4 | Confirm payment readiness in production | **COMPLETED** — no Stripe keys set, all `Product` rows £0 and inactive |
| A5 | Propose the geography model, lead model, credit ledger and matching engine | **COMPLETED** — `LOCATION_AND_LEAD_SYSTEM_SPEC.md` |
| A6 | Record the migration order and rollback position | **COMPLETED** — `DATABASE_CHANGELOG.md` |
| A7 | Recommend a pilot grounded in provider supply, not keyword demand | **COMPLETED** — spec §8 |
| A10 | Create the second project's planning documents (master plan now readable) | **COMPLETED** — `docs/leadgen/`: MASTER_PLAN, GEOGRAPHY_SCHEMA, LEAD_ROUTING_AND_PRIVACY, TECHNICAL_SEO_CHECKLIST, SEO_EXPERIMENTS, CONTENT_BRIEFS/, and four CSVs |
| A11 | Verify Supabase can host the fine-grained cron | **COMPLETED** — pg_cron 1.6.4 + pg_net 0.20.4 available, Postgres 17.11, no `cron` schema yet; role is `postgres` with `supabase_privileged_role`, not superuser |
| A8 | Obtain and read `UK_Local_Services_Lead_Generation_SEO_Master_Plan.docx` and the platform `.txt` | **COMPLETED** — both found in `docs/` on 26 October and read in full. The `.txt` is identical to the pasted prompt; the `.docx` adds England-first scope, per-category keyword scope, named demand sources, and a different suggested pilot area |
| A9 | Owner decisions D1–D6 | **COMPLETED** — all six settled, see `DECISIONS.md` |

### A9 — owner decisions

**The live list is `DECISIONS.md` in the repository root.** Summarised here; that file is the one to edit.

D1 scheduler and D2 address lookup are settled. D3 admin accounts, D4 VAT, D5 registration flow and D6 pilot
area are open. **None of them blocks batch B3** — the resolver and the geography schema are area-agnostic.

| ID | Decision | Why it blocks | Recommendation |
|---|---|---|---|
| ~~D1~~ | ~~Scheduler for the 3-minute escalation~~ | **DECIDED 26 Oct: Supabase `pg_cron`** for anything Vercel cannot schedule. Verified available on our instance (pg_cron 1.6.4, pg_net 0.20.4, not yet installed). Immediate escalation ships first and needs no scheduler | — |
| ~~D2~~ | ~~Address-lookup provider and budget~~ | **DECIDED 26 Oct: Ideal Postcodes** (Royal Mail PAF). Key verified live against their free test postcode. Gives selectable addresses + UDPRN/UPRN, but **no GSS codes**, so postcodes.io still supplies the codes our tree keys on. See `docs/leadgen/ADDRESS_LOOKUP.md` | — |
| D3 | Individual admin accounts | One shared password makes role-based PII restriction and per-admin audit impossible | Add an `AdminUser` model with a `role` field |
| ~~D4~~ | ~~VAT treatment~~ | **DECIDED 26 Oct: £1 is the price EXCLUDING VAT.** VAT added at checkout when it legally applies, configurable, defaulting to off. Only charged once VAT-registered (HMRC threshold £90,000 rolling 12 months) | — |
| ~~D5~~ | ~~Where registration lives~~ | **DECIDED 26 Oct: build a new registration flow.** It converges on `grantOwnership()`, reuses `claimEvidence()`, feeds the existing moderation queue, grants credits only on a verified account, and detects an existing listing so registration becomes a claim rather than a duplicate | — |
| ~~D6~~ | ~~Pilot area~~ | **DECIDED 26 Oct: the whole of East London** — Tower Hamlets, Hackney, Newham, Waltham Forest, Redbridge, Barking and Dagenham, Havering. 193 settlements, 148 wards, all imported. The customer form opens borough by borough as providers exist | — |

---

## Phase B — geography and business onboarding · IN PROGRESS

- [x] `Place`, `PlaceAlias`, `PlaceLink` tables — additive, RLS enabled, verified in both schemas
- [x] Backfill the 83 `Location` rows — **80 mapped** (33/33 boroughs, 47/50 neighbourhoods). Angel, Greenwich Town and Ealing Broadway are named as unmapped rather than attached to a plausible neighbour
- [x] `Business.placeId` alongside `locationId`, populated for all 40 dev businesses; **nothing reads it**
- [x] **Acquire England geography from authoritative sources** — `docs/leadgen/geography/`: 70,657 place rows (43,084 localities, 5,376 built-up areas, 1,797 sub-divisions, 11,068 parishes, 8,040 wards, plus every administrative tier) and the current 2026 skeleton (9 regions, 153 counties/unitaries, 296 local authorities, 6,834 wards). Every row carries its source and fetch date; `node scripts/fetch-england-places.mjs` regenerates it
- [ ] Add the OGL attribution to the site — required wherever this data is published, and not yet present
- [x] Joined — **7,037 places flagged `confidence=LOW`** and attached to their region because the 2016 authority no longer exists. None reattached by guesswork
- [x] Alias layer live: 3,721 inverted sort forms from ONS plus 4 PrimeStreet editorial names, each with its own source. **Still to add: Dagenham Dock, Beam Park and Angel, which need a human source**
- [x] `resolvePostcode()` returning a **confirmable suggestion** — GSS-code path, name fallback, localities offered as ranked candidates and never auto-selected
- [x] `src/lib/address.ts` + `/api/address/lookup` — key stays server-side, shape validated before any spend, per-IP hourly/daily and site-wide caps enforced **before** the call
- [x] Alias map for the 4 ONS spellings PAF will not reproduce, each asserted against the imported tree by a test
- [x] Set `IDEAL_POSTCODES_KEY` on Vercel production (26 Oct). Not set on preview, so preview cannot spend money
- [ ] **Confirm the PAF caching terms** before building any postcode-to-address cache. Storing the address a user selected is normally fine; a general cache to avoid paying for lookups generally is not
- [ ] Manual cascading selectors (country → region → authority → town → locality), searchable, usable on mobile
- [x] Server-side registration: validation, duplicate detection, email verification, one-approval creation of listing + ownership + credits (`src/lib/registration.ts`). **The forms themselves are not built yet**
- [x] `BusinessServiceArea` with `EXACT` / `INCLUDES_CHILDREN` — table live in dev; the owner-facing selector is still to build
- [x] `BusinessCategory` and `CategoryAlias` — 36 search terms mapped, 0 ambiguous. **The taxonomy is the problem, not the mapping: see below**
- [ ] Businesses can edit their location later, with the change recorded in `BusinessEditLog`
- [x] The registration UI: `/register` with postcode and address picker, manual selector always available, category and service-area selectors, verification email, `/register/sent`, `/register/verify/[token]`
- [ ] Tests: spec §18 items 1–7

### The two real blockers now that the decisions are done

Neither is a decision about design. Both are about there being something to route a lead to.

| Blocker | Why it stops Phase D | Who |
|---|---|---|
**No trade categories** | Nothing can match a plumbing lead until `plumbing` exists. A category changes live URLs, so it is an editorial call | owner |
**No provider supply** | Production: 3 businesses, 0 owners, 1 of them in East London and it is a bakery. Two paying recipients per lead needs two providers in that trade and area | owner |

- [ ] Add the trade categories (owner decision, affects live URLs)
- [ ] Recruit providers, Barking and Dagenham first
- [ ] Per-borough, per-trade switch so the form only opens where providers exist

---

### Blocker found in B3: the taxonomy is a directory taxonomy, not a trades one

The 12 existing categories are business **sectors** — restaurants, cafes, beauty, gyms, property, retail,
technology, professional services, logistics, construction. Only `cleaning` and `removals` are trades the lead
system can route to.

**18 trades the brief requires have no category at all:** plumbing, electrical, painting-and-decorating,
gardening, roofing, locksmith, handyman, heating-and-boilers, building, landscaping, plastering, tiling,
carpentry, pest-control, rubbish-removal, fencing, driveways, flooring.

A category is an editorial decision about what the directory covers and it changes live URLs, so these were
**not** created automatically. They are needed before any trade lead can be matched.

- [x] **18 trade categories added** from the owner's own master plan, with 205 aliases. No intro text written, so each is usable for matching but not indexable until real copy exists
- [x] Aliases seeded: 226 distinct search terms across 30 categories. "plumber" reaches Plumbing, "painter" reaches Painting and decorating

---

### Registration is live end to end (dev)

- [x] `/register` → verification email → `/admin/registrations` → one approval creating listing + ownership + 5 credits
- [x] Registrations share the existing moderation queue, flagged with whether the email is confirmed and whether it looks like a duplicate
- [x] Owner-facing editing of service areas and categories after registration — `/owner/business/[id]/areas`, see below
- [x] An e2e suite driving the whole form in a real browser: 45 checks, `scripts/e2e-registration.mjs`. Runs with mail disabled so it cannot send a real email, and uses the free test postcode so it cannot spend money

---

## Phase C — lead creation and admin dashboard · MOSTLY DONE

- [x] `JobRequest` with `consentVersion`, `consentAt`, `idempotencyKey` — in `dev`, **not yet in production**
- [x] Customer job-request form at `/get-quotes`: the existing anti-abuse controls reused verbatim (honeypot, four-second form-token floor, disposable-email check, five-a-day per email, `ipHash`)
- [x] Customer never needs to understand the hierarchy; **never asked for a full address** — postcode optional, and the borough alone is accepted
- [x] Idempotency against double-submit, refresh and network retry — keyed on the content, so all three collapse to one job. Proven with three simultaneous submissions and with a browser resubmit
- [x] The supply check runs **before** contact details are asked for. Where nobody covers the area the form says so and the rest of it stays shut until the customer says to send it anyway
- [x] `/admin/leads` — every lead immediately, with the supply that existed when it arrived and the supply now
- [x] Customer contact details behind `leads.customer_contact`, revealed one at a time, every reveal audited with the administrator's identity and never the details themselves
- [x] Closing a lead requires a reason; `NO_PROVIDER` is counted, because it is the recruiting signal
- [ ] Lead detail: every `MatchDecision` with its reason, notification outcomes, credit movements — **waits on Phase D**, which is where those records start existing
- [x] Tests: 53 unit checks (`test-leads.ts`) and 38 browser checks (`e2e-leads.mjs`)

## Phase D — matching and assignment · DONE in dev

- [x] `matchJobRequest()` — idempotent, re-runnable, never double-charging
- [x] Four-stage expansion: exact place → parent → wider administrative area → nearby **opt-in only** (`Business.acceptsNearby`, default false)
- [x] Every inclusion and exclusion written to `MatchDecision` with a reason — including businesses at stages never reached, who are the ones most likely to ask
- [x] Two-paying-business limit enforced **at the database level**: partial unique index on (`jobRequestId`, `paidSlot`) plus a CHECK that a slot can only ever be 1 or 2
- [x] Round-robin among equally eligible businesses: fewest assignments, then longest wait, then id so it is deterministic
- [x] Manual admin assignment, `PAID` vs `SPONSORED`, reason required, limit still enforced — sponsored takes no place and charges nothing
- [x] Never mark a lead assigned when assignment failed: the place is claimed first, the credit second, and a failed charge releases the place rather than leaving a row that looks paid
- [x] Reversal refunds the credit, frees the place, and leaves the row visible to the business
- [x] Tests: 64 unit checks including **five simultaneous runs on one job** → two assignments, two charges · 35 browser checks across customer, administrator and business
- [ ] Apply to production: `npm run matching:ddl -- --schema=public` — **waiting on authorisation**

## Owner-side editing · DONE in dev

- [x] `/owner/business/[id]/areas` — a business can change its service areas, its trades and the nearby opt-in itself
- [x] Borough-wide or locality-level, with the mode **derived** from which box was ticked rather than a separate switch that can disagree with it
- [x] Server-side validation against the offered set, so editing a hidden field cannot grant coverage of somewhere we do not cover, or a trade we do not list
- [x] At least one area and one trade enforced: emptying either would make the business invisible to matching, which is a decision and not a side effect
- [x] Real demand counted for them — requests in their areas, and how many were sent to them
- [x] Audited, and written to the business's own edit log
- [x] Takes effect on the **next** job request, with no deploy: proven in a browser
- [x] Tests: 41 unit checks (`test-coverage.ts`) and 23 browser checks (`e2e-coverage.mjs`), including that one owner cannot edit another's coverage
- [ ] Owners still cannot change the **address or postcode** that located them at registration — still an email to us

## Phase F — notifications and escalation · DONE in dev

- [x] The business is emailed the moment it has a job, with the customer's name and phone **in the email**
- [x] A sweep sends anything that was assigned but never notified, so a failed send delays rather than loses
- [x] A business with no email address at all is left visibly unnotified and the gap is audited — never marked as told
- [x] One chase after 4 hours unopened, offering the way out rather than only nagging
- [x] After 24 hours unopened: the job is taken back, **the credit is refunded**, it is reassigned, and both businesses are told
- [x] The customer is told, once, after 6 hours with nobody assigned — and never told that in a run that just found them somebody
- [x] Everything idempotent on a column, so a cron firing twice sends nothing twice
- [x] Hourly from Supabase `pg_cron` + `pg_net`, documented with the SQL in `docs/leadgen/SCHEDULED_JOBS.md`
- [x] Tests: 46 unit checks (`test-lead-notify.ts`, with time moved backwards rather than waited out) and 5 added browser checks
- [ ] Apply to production: `npm run notify:ddl -- --schema=public`, and schedule the Supabase job
- [ ] Retention deletion is still a policy, not a job: needs `pg_cron` and a decision on anonymising vs deleting

## Phase E — credits and payments · PARTLY DONE

- [x] `CreditAccount`, `CreditTransaction` — a ledger, not a mutable number
- [x] Five free credits, granted **once**, guarded three ways: `freeGrantAt`, a partial unique index, and a conditional update. Proven against three simultaneous calls
- [x] Atomic spend with the balance check **in the same statement** as the decrement; reversal and adjustment as their own ledger rows. Proven against 8 concurrent spends of 5 credits
- [ ] `Product` row `kind = "CREDITS"`; one new branch in `processEvent()`
- [ ] Purchase UI: quantity × £1, plain calculation, 5/10/25/50/custom
- [x] `creditPurchase()` is idempotent per order, so a duplicate webhook grants nothing. **Not yet wired to Stripe**
- [ ] Zero credits: listing stays live, automatic paid assignment stops
- [ ] **BLOCKED on Stripe keys in production** and on D4 (VAT)
- [ ] Tests: spec §18 items 21–28

## Phase F — notifications and escalation · NOT STARTED

- [ ] Urgent assignment email: genuine urgency only, no invented expiry or false exclusivity
- [ ] In-app notifications for owners — the `OWNER` audience exists in `Notification` and is currently unused
- [ ] Low-credit (default threshold 2) and zero-credit emails, de-duplicated via `lowWarnedAt` / `zeroWarnedAt`
- [ ] Immediate escalation when no eligible recipient exists
- [ ] Delayed escalation check via Supabase `pg_cron` + `pg_net` (D1 decided). Extensions need enabling in the Supabase dashboard — owner action
- [ ] Retry handling and delivery logging; lead stays visible when email fails
- [ ] SMS/WhatsApp — **no provider integrated**; out of scope until one is chosen

## Phase G — testing, privacy and release · IN PROGRESS

- [x] **The privacy notice now describes the lead system in full** — what is collected, that it goes to at most two businesses, what they may do with it, retention, and how to have it deleted. It had described none of that, while every job request stored consent to it
- [x] `/privacy` carries the version string from the code, and a test refuses a hardcoded one, so bumping `PRIVACY_NOTICE_VERSION` forces the wording to be reviewed
- [x] `npm run release:check [-- --schema=public]` — read-only, blockers separated from things that work badly, and honest that it reads configuration from the shell rather than the deployment
- [x] `docs/leadgen/RELEASE_CHECKLIST.md` — every step between dev and taking money, with what is blocked on whom
- [x] `docs/leadgen/BUSINESS_TERMS_DRAFT.md` — lead-credit terms written to match what the code actually does, with five questions for the reviewer
- [x] Breadcrumb structured data on `/get-quotes` and `/register`; the `/authors` 404 that shipped on every author page removed
- [ ] **Production: 9 blockers**, listed in the checklist. Schema, places, trade categories, administrator accounts, `CRON_SECRET`, Stripe, and supply
- [ ] Legal review of the six items in `LEAD_ROUTING_AND_PRIVACY.md` §12 — the lawful basis for sharing contact details first
- [ ] SPF, DKIM and DMARC on the sending domain
- [ ] Retention deletion as a scheduled job, not a policy
- [ ] The editorial SEO backlog the audit reports (6 over-long titles and descriptions), which predates this work

## Phase G — original list

- [ ] Unit, integration, concurrency, security and e2e suites added to `npm run test:unit` / `test:e2e`
- [ ] a11y pass on every new page at 390px and 1440px
- [ ] Privacy notice updated for the new processing purpose (sharing contact details with up to two businesses)
- [ ] Marketing consent separate and unticked
- [ ] Retention, deletion and role-based access rules implemented
- [ ] **Legal review** of the privacy notice, business terms, £1 credit terms, refunds and VAT — owner action, cannot be substituted
- [ ] Verify directory registration, reviews, listings, Premium enquiries and existing URLs all still work
- [ ] Migration and rollback instructions confirmed

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **No provider supply** (3 businesses, 0 owners in production) | Leads nobody can service; reputational damage on the first enquiry | Recruit 3–5 real providers in one service × borough **before** the form goes live (spec §8) |
| Geography migration breaks indexed URLs | Loss of existing search visibility | Additive migration; `Location` retained; redirects verified before anything is retired |
| Two-business limit lost to a race | Overselling a lead; breach of a hard commercial promise | Database-level partial unique index, not application logic alone |
| Double credit deduction | Charging a business twice | Ledger + unique `(jobRequestId, businessId)` + conditional balance update in one transaction |
| Duplicate webhooks granting credits twice | Revenue and trust | `StripeEvent` idempotency, already proven in production for Premium |
| Sharing PII without a lawful basis | Regulatory exposure | Consent captured and versioned; recipients only; legal review before launch |
| Scaled thin location pages | Google spam-policy action against the whole domain | Three-page batch limit; existing SEO gate already refuses to index a page without real content |
| Sponsored assignments used to bypass the paid limit | Undermines the commercial model | Admin-only, reason required, fully audited, reported separately |
