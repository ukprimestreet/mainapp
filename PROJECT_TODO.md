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
| A9 | Owner decisions D2–D6 (D1 decided) | **AWAITING APPROVAL** — see below |

### A9 — the decisions that gate Phase B (D1 settled, five open)

| ID | Decision | Why it blocks | Recommendation |
|---|---|---|---|
| ~~D1~~ | ~~Scheduler for the 3-minute escalation~~ | **DECIDED 26 Oct: Supabase `pg_cron`** for anything Vercel cannot schedule. Verified available on our instance (pg_cron 1.6.4, pg_net 0.20.4, not yet installed). Immediate escalation ships first and needs no scheduler | — |
| D2 | Address-lookup provider and budget | Address-level selection needs licensed PAF/AddressBase. No free source exists | Ship manual cascading selection first; add address lookup when a provider is chosen |
| D3 | Individual admin accounts | One shared password makes role-based PII restriction and per-admin audit impossible | Add an `AdminUser` model with a `role` field |
| D4 | VAT treatment of £1 credits | Changes the displayed price and the invoice. Cannot sell before it is settled | Owner to confirm with an accountant |
| D5 | Where business registration lives | No self-service go-live flow exists today | Extend the existing claim/owner flow |
| D6 | **Pilot area**: West Berkshire (master plan §12) or Barking and Dagenham (this spec §8) | Decides whether Phase B imports a whole new region or extends existing geography | Barking and Dagenham first, West Berkshire as market two |

---

## Phase B — geography and business onboarding · IN PROGRESS

- [x] `Place`, `PlaceAlias`, `PlaceLink` tables — additive, RLS enabled, verified in both schemas
- [x] Backfill the 83 `Location` rows — **80 mapped** (33/33 boroughs, 47/50 neighbourhoods). Angel, Greenwich Town and Ealing Broadway are named as unmapped rather than attached to a plausible neighbour
- [x] `Business.placeId` alongside `locationId`, populated for all 40 dev businesses; **nothing reads it**
- [x] **Acquire England geography from authoritative sources** — `docs/leadgen/geography/`: 70,657 place rows (43,084 localities, 5,376 built-up areas, 1,797 sub-divisions, 11,068 parishes, 8,040 wards, plus every administrative tier) and the current 2026 skeleton (9 regions, 153 counties/unitaries, 296 local authorities, 6,834 wards). Every row carries its source and fetch date; `node scripts/fetch-england-places.mjs` regenerates it
- [ ] Add the OGL attribution to the site — required wherever this data is published, and not yet present
- [x] Joined — **7,037 places flagged `confidence=LOW`** and attached to their region because the 2016 authority no longer exists. None reattached by guesswork
- [x] Alias layer live: 3,721 inverted sort forms from ONS plus 4 PrimeStreet editorial names, each with its own source. **Still to add: Dagenham Dock, Beam Park and Angel, which need a human source**
- [ ] `resolvePostcode()` returning a **confirmable suggestion**, never a silent assignment
- [ ] Manual cascading selectors (country → region → authority → town → locality), searchable, usable on mobile
- [ ] Mandatory location confirmation in onboarding, per D5
- [ ] `BusinessServiceArea` with `EXACT` / `INCLUDES_CHILDREN`, scope visible to business and admin
- [ ] `BusinessCategory` (multiple per business) and `CategoryAlias` (synonym mapping)
- [ ] Businesses can edit their location later, with the change recorded in `BusinessEditLog`
- [ ] Tests: spec §18 items 1–7

## Phase C — lead creation and admin dashboard · NOT STARTED

- [ ] `JobRequest` with `consentVersion`, `consentAt`, `idempotencyKey`
- [ ] Customer job-request form: reuse the existing anti-abuse controls verbatim (honeypot, form-token timing, disposable-email check, IP/email/business rate limits, `ipHash`)
- [ ] Customer never needs to understand the hierarchy; **never asked for a full address**
- [ ] Idempotency against double-submit, refresh and network retry
- [ ] `/admin/leads` — every lead immediately, assigned or not
- [ ] Lead detail: resolved place chain, every `MatchDecision` with its reason, notification outcomes, credit movements, full audit
- [ ] Tests: spec §18 items 16, 20

## Phase D — matching and assignment · NOT STARTED

- [ ] `matchJobRequest()` — idempotent, re-runnable, never double-charging
- [ ] Four-stage expansion: exact place → parent → wider administrative area → nearby opt-in only
- [ ] Every inclusion and exclusion written to `MatchDecision` with a reason
- [ ] Two-paying-business limit enforced **at the database level** (partial unique index on `paidSlot`)
- [ ] Round-robin allocation among equally eligible businesses
- [ ] Manual admin assignment, `PAID` vs `SPONSORED`, reason required, limit still enforced
- [ ] Never mark a lead assigned when assignment failed
- [ ] Tests: spec §18 items 8–15, 18–19 — **including concurrency**

## Phase E — credits and payments · NOT STARTED

- [ ] `CreditAccount`, `CreditTransaction` — a ledger, not a mutable number
- [ ] Five free credits, granted **once**, guarded by `freeGrantAt` + unique account row
- [ ] Atomic reserve → confirm → reverse, inside one transaction with a conditional balance update
- [ ] `Product` row `kind = "CREDITS"`; one new branch in `processEvent()`
- [ ] Purchase UI: quantity × £1, plain calculation, 5/10/25/50/custom
- [ ] Credits added **only** on verified webhook confirmation; duplicate webhooks grant nothing
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

## Phase G — testing, privacy and release · NOT STARTED

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
