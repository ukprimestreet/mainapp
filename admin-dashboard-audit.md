# Admin Intelligence Dashboard — Phase 0 Audit

**Date:** 26 October 2026
**Scope:** everything needed before building the Business Intelligence / Growth dashboard in the Prime Street admin panel.
**Method:** read of `prisma/schema.prisma`, `src/lib/auth.ts`, `src/lib/admin-users.ts`, `src/lib/analytics.ts`, `src/lib/commerce.ts`, the existing `/admin` dashboard and `/admin/money` page, `docs/leadgen/MASTER_PLAN.md` and `LOCATION_AND_LEAD_SYSTEM_SPEC.md`. No code was changed while producing this document.

---

## 1. Existing functionality (do not rebuild)

| Area | What exists | Where |
|---|---|---|
| Admin auth | Per-admin accounts (`AdminUser`) with scrypt password, optional TOTP, session-version revocation, plus a legacy shared-password fallback that auto-closes once a real account exists | `src/lib/auth.ts`, `src/lib/admin-users.ts` |
| Permissions | Capability map (`PERMISSIONS`), two roles (`SUPER_ADMIN`, `ADMIN`), `requirePermission()` for server actions, `adminCan()` for conditional rendering | `src/lib/admin-users.ts` |
| Audit trail | `AuditLog` (action, targetType, targetId, actor, actorKind, detail), written via `audit()` on admin mutations already | `src/lib/audit.ts`, `prisma/schema.prisma` |
| Dashboard design system | `Card`, `Metric`/`MetricRow` (with built-in % vs previous period and sparkline), `BarChart`, `Breakdown`, `Table`, `Chip`, `Notice`, `Empty`, `Progress`, `Activity` — all server-rendered, no client chart library | `src/components/dash/*`, re-exported via `src/components/Dash.tsx` |
| Series/analytics helpers | `buildSeries`, `seriesFromDates`, day-bucketed series with `deltaPct` that is `null` (not `0`) when there is no prior-period data to compare — the exact "don't fabricate a %" pattern this project already requires | `src/lib/analytics.ts` |
| Admin landing page | `/admin` — an editorial/ops triage board (review queue, moderation, claims, writers, 30-day views/searches, 30-day revenue, recent activity). Deliberately **not** a finance dashboard today | `src/app/admin/(panel)/page.tsx` |
| Money page | `/admin/money` — MRR, at-risk MRR (past-due), paid-orders total, writer payments owed, recent orders, churn, revenue-by-stream `Breakdown` | `src/app/admin/(panel)/money/page.tsx` |
| Commerce | `Product` (PREMIUM/FEATURED, price ex-VAT comment, Stripe price id, `active` gate), `Subscription`, `Order`, `StripeEvent` idempotency, `Campaign` (FEATURED/AD placements, impression caps, fair rotation), `Sponsorship`, `SalesEnquiry` | `src/lib/commerce.ts`, `src/lib/billing.ts`, schema |
| Key-value settings | `Setting` model + `saveSetting()` action + `/admin/settings` editable list, written to the audit log | `src/app/admin/ops-actions.ts`, `src/app/admin/(panel)/settings/page.tsx` |
| Simple leads | `Lead` = Premium-only enquiry form submission. On create, emails every linked `Owner` via `sendTemplate` (outbox-recorded, not guaranteed delivered) | `src/app/businesses/lead-actions.ts` |
| Writer payments | `WriterPayment` (DUE/SUBMITTED/APPROVED/PAID), `Commission` — the only "money owed by us" ledger that exists today | schema, `/admin/payments` |

**Conclusion: do not rebuild** auth, permissions, audit logging, the chart/metric components, the series/percentage-change math, the Stripe webhook pipeline, or the money page's existing MRR/churn calculations. Phase 1 reuses all of it.

## 2. Existing data sources usable today

- `Order` (status PAID/FAILED/PENDING/REFUNDED, `amountPence`, `productKey`, `createdAt`, `paidAt`) → one-off revenue (Featured) and the first-payment event for a Premium plan.
- `Subscription` (status ACTIVE/PAST_DUE/CANCELED, `productKey`, `currentPeriodEnd`, `provider`, `createdAt`, `updatedAt`) → MRR, paying-business counts, churn, renewals.
- `Product` (`pricePence`, `interval`, `kind`) → turns a subscription into a monthly-equivalent value (`monthlyPence()` already exists).
- `Sponsorship` (`pricePence`, `invoiced`, `status`, `createdAt`) → sponsorship income, but **no payment date** — only `createdAt`.
- `Lead` (`businessId`, `createdAt`, `status`) → leads submitted. `status` is admin-set (NEW/READ/ARCHIVED), not a delivery confirmation.
- `Business` (`isSample`, `published`, `claimStatus`, `createdAt`) → business counts.
- `WriterPayment` (`amountPence`, `status`, `createdAt`, `paidAt`) → the only recorded cost today.
- `AuditLog`, `ClaimRequest`, `BusinessSubmission`, `ProfileChangeRequest`, `SalesEnquiry` → existing "needs a decision" queues, already summed on `/admin`.
- `Setting` → generic place to store a monthly revenue target without a schema change.

## 3. Missing data (confirmed by reading the schema, not assumed)

| Needed for the brief | Status |
|---|---|

| VAT tracking (collected vs. recognised revenue) | **Not built.** `Product.pricePence` is commented "ex VAT" as an intention, but no VAT rate, no VAT-exclusive/inclusive split is stored anywhere, and Stripe tax is not configured. Every revenue figure today is **gross as charged**, VAT status unknown. |
| General operating expenses (hosting, marketing, sales cost, contractors, payment fees, etc.) with category/date/amount/recurring | **Not built.** `WriterPayment` is the only cost ledger, and it only covers editorial freelancers. |
| Operating cash balance, cash runway, outstanding receivables | **Not built.** No cash-balance field anywhere. |
| Advertising (`Campaign` kind `AD`) revenue | **Not built as money.** `Campaign`/`CampaignStat` track impressions and clicks only — there is no price, `Order`, or ledger row for an AD campaign. Ad revenue cannot be reported without fabricating a number. |
| Partnerships revenue | **Not built.** `SalesEnquiry.interest` can be `"partnership"`, but it is a CRM lead, not a priced deal. |
| Sales CRM (stage, acquisition cost, sales owner, follow-up dates) | **Not built.** `SalesEnquiry` has `status: NEW/CONTACTED/WON/LOST` only — no stage pipeline, no cost, no owner. |
| GA4 / Search Console integration | **Not built.** No stored tokens, no sync job, no "last synced" record. |
| Customer-reported outcomes (contacted/quoted/booked/won) | **Partially since built**: `LeadAssignment.responseKind` captures CALLED/DECLINED (see §15). Quoted/booked/won stages are not captured — Phase 8's remaining scope, and must extend this field rather than introduce a duplicate model. |
| Configurable alert rules/thresholds | **Not built.** `/admin` hardcodes a few "needs a decision" counts; there is no alert-definition table, no per-admin configuration. |
| Receiving-business / postcode / borough lead breakdown at the geography detail the brief wants | **Partially possible** via `Business.locationId`/`City`, but the new `Place` geography (boroughs, wards) exists only for a subset of migrated locations — see `GEOGRAPHY_SCHEMA.md`. |

## 4. Metric definitions used for Phase 1 (what is built)

All amounts are **gross, as charged** — VAT exclusion is not possible until D4 (VAT, per `MASTER_PLAN.md` §12) is decided and implemented. This is disclosed on the dashboard, not hidden.

- **Revenue for the selected period** = `Order.amountPence` summed where `status = PAID` and `paidAt` (falling back to `createdAt`) is in the period, **plus** `Sponsorship.pricePence` where `invoiced = true` and `createdAt` is in the period. Advertising and lead-credit revenue are excluded because no monetary record exists for them — the dashboard says so rather than showing zero silently.
- **Monthly recurring revenue (MRR)** = `Σ monthlyPence(product)` over `Subscription` rows with `status ∈ {ACTIVE, PAST_DUE}`, same formula as `/admin/money` (not recomputed differently).
- **Paying businesses** = distinct `Business.id` with an ACTIVE/PAST_DUE `Subscription` **or** a PAID `Order`, counted at the end of the period.
- **New paying businesses** = distinct businesses whose **first-ever** PAID order or ACTIVE subscription falls inside the period.
- **Net membership growth** = (subscriptions that became ACTIVE in period) − (subscriptions that became CANCELED in period).
- **Leads submitted** = `count(Lead)` created in period.
- **Leads successfully delivered / valid-lead rate** = **not calculated**. There is no delivery-confirmation or validity-review data. The card shows "Not trackable yet" with a link to this document, rather than inventing a number from `Lead.status`, which an admin sets for their own triage and does not mean "delivered."
- **Revenue by source** = breakdown of the revenue figure above into Memberships / Featured listings / Sponsorships, each labelled with its data source; Lead credits, Advertising, Partnerships and "Other" are shown as **£0 — not yet tracked**, never omitted and never implied to be genuinely zero.
- **Recorded operating expenses** = `WriterPayment.amountPence` where `status ∈ {APPROVED, PAID}` and the relevant date is in period. Labelled "Writer payments only — other operating costs are not yet recorded" (Phase 7 adds a general ledger).
- **Estimated operating profit** = revenue − recorded operating expenses, explicitly labelled as an estimate based only on what is recorded, never presented as a statutory figure.
- **Operating cash balance** = shown as "Not entered" until Phase 7 adds a field for it.
- **Progress towards the monthly revenue target** = current calendar month's revenue (by the definition above) against a target stored in `Setting` (`revenue.monthly_target_pence`). Shown as "No target set" until an admin sets one in Settings.
- **% change vs previous period**: only shown when the previous period is complete and has at least one comparable data point (reusing the existing `deltaPct: number | null` convention) — identical logic to the current `/admin` and `/admin/money` pages.

## 5. Proposed database changes

**Phase 1 needs none.** The `Setting` table already covers the one new persisted value (`revenue.monthly_target_pence`). No migration is required to ship Phase 1.

Phases 2–8 will need (not built yet, listed for sequencing only):
- `Expense` (category, date, amountPence, recurring boolean, note, createdBy) — Phase 2/7.
- `CashSnapshot` or `Setting`-based cash balance with a timestamp — Phase 7.
- `LeadCredit` ledger + `LeadAssignment` + idempotency keys — Phase 4, already scoped in `LOCATION_AND_LEAD_SYSTEM_SPEC.md`.
- `SalesProspect` (stage, source, cost, owner, follow-up dates) — Phase 5.
- `AnalyticsSync` (GA4/GSC tokens, last-synced-at) — Phase 6.
- `LeadOutcome` (business-reported contacted/quoted/booked/won) — Phase 8.
- `AlertRule`/`AlertEvent` — Phase 8.

Each will get its own migration and its own approval checkpoint, per the brief's instruction not to change the stack or business logic without explaining why.

## 6. Proposed dashboard components (Phase 1)

New route: **`/admin/growth`** (kept separate from `/admin`, which stays the editorial/ops triage board it already is, and separate from `/admin/money`, which stays the detailed finance page). Linked from the admin nav under "Revenue". Built entirely from the existing `Dash` component library:

- `MetricRow` of: Revenue (period), MRR, Paying businesses, New paying businesses, Net membership growth, Leads submitted, Recorded expenses, Estimated operating profit.
- A `Progress` tile for the monthly revenue target.
- `Breakdown` for revenue by source (with the un-trackable sources shown, not hidden).
- `Table` drill-down links from every KPI to its existing detail page (`/admin/money`, `/admin/businesses`, `/admin/commerce`, a new `/admin/businesses?filter=new` style link, etc.) or a focused list where none exists yet.
- An "Alerts" `Card` built from already-available signals (failed payments, past-due subscriptions, pending claims/moderation) — a lightweight version of the full Phase 8 alert system, clearly not the configurable version promised later.
- Date-range control: Today / Last 7 days / Last 30 days / This month / Last month / This year / Custom, as a plain `<form>` GET with `searchParams` (same pattern already used across the admin panel), so it works without client JavaScript and is bookmarkable.
- `Empty`/`Notice` states for zero data, disconnected integrations (used from Phase 6 onward) and "not yet tracked" metrics.

## 7. Security considerations

- New page requires `requirePermission("money.view")` (already defined, already restricted to `SUPER_ADMIN`), matching `/admin/money`.
- No new client-exposed data: all queries run server-side in a Server Component; no API route is added for Phase 1.
- Customer contact data (`Lead.email`/`phone`) is never rendered on this dashboard — only aggregate counts.
- Drill-down links route to existing permission-gated admin pages; no new unguarded data surface is introduced.
- All reads use existing Prisma indexes (`Order.createdAt` via default, `Subscription`, `Lead.businessId/status`); for Phase 1 volumes (tens–hundreds of rows) no new index is required. Revisit once lead volume grows (Phase 4 will add indexes alongside the credit ledger).
- No secrets added; nothing talks to an external API in Phase 1.

## 8. Implementation phases and acceptance tests (from the brief)

| Phase | Depends on | Status |
|---|---|---|
| 0 — Audit | — | **Done** (this document) |
| 1 — Main dashboard | Phase 0 | **This change.** Acceptance: every KPI matches a manual query against the same tables; percentage changes are `null` (not `0%`) when there's no prior period; date filters produce consistent totals across boundaries (verified by `scripts/test-growth-dashboard.ts`) |
| 2 — Finance & revenue reporting | Phase 1 confirmed | **Done** (§11) |
| 3 — Business & membership analytics | Phase 1 | **Done** (§12) |
| 4 — Lead analytics | Lead-credit system (`LOCATION_AND_LEAD_SYSTEM_SPEC.md`) | **Done** (§15) — originally deferred as blocked, since confirmed to have been built by a separate process (see `BATCH_LOG.md`); rebuilt the analytics layer against the real schema. |
| 5 — Sales CRM | Phase 1 | **Done** (§13) |
| 6 — Website/content analytics | GA4/GSC credentials from owner | Not started |
| 7 — Costs & cash flow | Phase 2 | **Done** (§14) |
| 8 — Outcomes & alerts | Phases 1–7 | Not started (Phase 1 ships a minimal, non-configurable alert card only) |

Per the brief: **Phase 2 does not start until Phase 1 is tested and its data sources are confirmed.**

## 9. Known limitations to disclose on the dashboard itself

- Revenue figures are **gross as charged**; VAT has not been separated out anywhere in the system.
- Lead quality/delivery/validity: delivery and business response (called/declined) are now reported (§15); a formal validity/refund-dispute review process is not built.
- Advertising and partnership revenue is not tracked in money terms at all; it will show as explicitly "not tracked," never as zero without explanation.
- Operating expenses only include writer payments and manually entered `Expense` rows; any other real cost is unrecorded.
- Cash balance and runway are **estimated**, not live: no bank feed exists. The figure on `/admin/costs` is a manually entered baseline plus recorded revenue minus recorded expenses since that date, and assumes sponsorship invoices are paid promptly (no payment-date field exists on a sponsorship).

## 10. Phase 1 delivery summary

**Features completed:**
- `/admin/growth` dashboard: revenue (period), MRR, paying businesses, new paying businesses, net membership growth, leads submitted, recorded operating expenses, estimated operating profit, revenue-by-source breakdown, progress towards a monthly revenue target, a lightweight alert list, and drill-down links from every KPI to an existing detail page.
- Date filters: today, last 7 days, last 30 days, this month, last month, this year, custom range — each with its own correctly-sized comparison window, and `comparable: false` set on periods (today, this month, this year) where a prior-period % would be misleading rather than useful.
- Percentage changes shown only when a real prior-period figure exists (`deltaPct` returns `null`, never `0%`, otherwise).
- No schema change required — the one new persisted value (`revenue.monthly_target_pence`) uses the existing `Setting` table and is editable from `/admin/settings`.
- Access restricted to `money.view` (currently `SUPER_ADMIN` only, matching `/admin/money`).
- 19 automated tests in `scripts/test-growth-dashboard.ts`, covering range-boundary math and every DB-backed metric against known fixtures; wired into `npm run test:unit`. Full suite (18 scripts, this one included) passes with zero regressions. `tsc --noEmit` is clean.

**Features explicitly not built in Phase 1** (deferred to the phase that owns them, per the brief — not oversights):
- Leads successfully delivered / valid-lead rate (Phase 4 — now reported for delivery/response, see §15; validity review still not built).
- VAT-exclusive revenue, general expense ledger beyond writer payments, operating cash balance, cash runway (Phases 2 and 7).
- Advertising and partnership revenue in money terms (no priced record exists for either yet).
- Sales CRM pipeline/conversion/CAC (Phase 5).
- GA4/Search Console integration (Phase 6 — no external setup has been requested from the owner yet; nothing to configure until that phase starts).
- Configurable, per-admin alert rules and thresholds (Phase 8 — Phase 1 ships a fixed, non-configurable version only: failed payments in the last 7 days, past-due memberships, pending business claims).

**External integration setup instructions:** none required for Phase 1 — no third-party service is used. Phase 6 (GA4/Search Console) and any future payment-fee or cash-balance integrations will each get their own setup instructions when those phases start.

**Gate to Phase 2:** per the brief, Phase 2 does not start until Phase 1 has been tested and its data sources confirmed. Tests pass and sources are documented above (§2–§4); this is now ready for your review and explicit go-ahead before Phase 2 (finance/revenue reporting) begins, since that phase also needs the VAT (D4) decision and the shape of the new expense ledger agreed first.

## 11. Phase 2 delivery summary

**Decision D4 (VAT), as given:** "build it so we can charge for VAT but admin can toggle it on or off. It will be off by default pending when we register for it legally." Implemented exactly as stated — see below.

**Schema change (applied to `dev`, not yet to `public`):**
- `scripts/ddl-finance.ts` — explicit, idempotent, schema-qualified DDL (per `DATABASE_CHANGELOG.md` house rule 2, never `prisma db push`). Adds `Order.vatPence`, `Order.vatRateBp`, `Order.source` (all additive, safe defaults) and a new `Expense` table (with RLS enabled). Verified against `dev` via `information_schema`/`pg_class`. **Production (`public`) has not been touched** — run `npx tsx scripts/ddl-finance.ts --schema=public` when ready to ship this, applying to `public` first per house rule 1.

**VAT:**
- `src/lib/vat.ts` — `vatSettings()` reads `Setting` keys `vat.enabled` (yes/no, default off) and `vat.rate_bp` (basis points, default 2000 i.e. 20% if ever turned on without a rate set). `applyVat(netPence, settings)` adds VAT on top of a VAT-exclusive price; a no-op whenever VAT is off.
- `src/lib/billing.ts` (`createCheckout`): when VAT is off, Stripe checkout uses the existing fixed `price: stripePriceId` exactly as before — **zero behaviour change**, confirmed by the unmodified `scripts/test-commerce.ts` suite still passing in full. When VAT is on, it switches to Stripe's ad-hoc `price_data` for a computed VAT-inclusive gross amount — no Stripe Tax configuration or other paid dependency introduced. The VAT amount is snapshotted onto the `Order` at creation (`vatPence`, `vatRateBp`), so a later rate change or toggle never rewrites historical orders.
- Renewal-revenue gap (found during Phase 2 review, not part of the original brief but a genuine undercount): `invoice.paid` previously only extended `Subscription.currentPeriodEnd` and never recorded a payment past the first billing cycle. It now creates a `RENEWAL` `Order` (status `PAID`, source `RENEWAL`) for every invoice after the first (`billing_reason !== "subscription_create"`), using the VAT settings in force at that moment. Guarded by the existing per-event idempotency plus a synthetic `stripeSessionId` (`inv:<invoice id>`) so the same invoice is never recorded twice.
- Settings page: `vat.enabled` and `vat.rate_bp` added to the editable list.
- Growth dashboard and the new Finance page report revenue **ex VAT**, with VAT collected shown as a separate, clearly labelled figure — never folded into "revenue", per the brief's explicit requirement.

**New Finance module (`/admin/finance`):**
- Revenue by stream (ex VAT) — reuses `revenueInRange` from `growth.ts` so the two dashboards never disagree.
- VAT collected, shown separately.
- Failed payments and refunds. Refunds are **admin-confirmed, not auto-matched** from Stripe: the `charge.refunded` webhook carries a charge/payment-intent id we don't store against an `Order`, so guessing the match would be worse than disclosing the limitation. An admin with the `refunds.issue` permission marks a specific `Order` refunded via a new action (`markOrderRefunded`), which is then what the finance page shows and totals — this is the one deliberate design trade-off in Phase 2, flagged here rather than hidden.
- Outstanding invoices: `Sponsorship` rows agreed (ACTIVE/DONE) but not yet marked invoiced.
- A new `Expense` ledger (category/description/amount/date/recurring), entirely separate from `WriterPayment`, with add/remove actions gated on `money.view`. `recordedExpenses()` (used by both Growth and Finance) now folds `Expense` in alongside writer payments.
- Contribution margin (revenue ex VAT minus recorded expenses) — labelled "not a statutory figure", same convention as Phase 1's estimated operating profit.
- CSV export for orders and expenses (`/admin/api/finance/export`), gated on `money.view`.
- Nav: "Finance" added under Revenue, between Growth and the existing Money page (which is left untouched — Finance is the deeper Phase 2 module, Money remains the quick MRR/churn overview).

**Still disclosed as not built (unchanged from §3/§9, or new findings):**
- Advertising and partnership revenue — still no priced record exists for either.
- Lead credits — built since this was written, by a separate process; see §15 for the Phase 4 analytics built against it.
- Cash balance / runway — still Phase 7.
- Automatic refund matching from Stripe webhooks — see above; deliberately manual in Phase 2.

**Tests:** `scripts/test-finance.ts`, 20 tests covering `applyVat`/`formatRate` (pure), `vatSettings()` (DB-backed, including the invalid-rate fallback), the `invoice.paid` renewal-order path (first invoice vs renewal vs replayed event id), VAT exclusion in `revenueInRange`, and every `finance.ts` helper (failed payments, refunds, outstanding invoices, expense grouping, CSV export). Wired into `npm run test:unit`. Full suite (20 scripts) passes with zero regressions; `tsc --noEmit` is clean.

**Gate to Phase 3:** awaiting your review and explicit go-ahead, as agreed for each phase.

## 12. Phase 3 delivery summary

**New Membership module (`/admin/membership`):**
- `src/lib/membership.ts` — all calculations pure/DB-backed, following the same pattern as `growth.ts`/`finance.ts`.
- Membership mix: active / past-due / cancelled counts and MRR per PREMIUM product.
- Segmentation by category and by location: MRR and paying-business counts for subscriptions in ACTIVE or PAST_DUE status (both count as "paying", called out explicitly via a `Notice` on the page since a past-due business is still billed, just at risk).
- Claim funnel: counts by `claimStatus` (UNCLAIMED/PENDING/CLAIMED/VERIFIED) plus the conversion rate from claimed-or-verified to actually paying.
- Monthly cohort retention: subscriptions grouped by the calendar month they started, with a retained-% for each cohort, rendered as `Progress` bars.
- Observed lifetime value: average observed lifetime (in months) and average LTV, computed only from subscriptions that have actually reached CANCELED — never projected forward. Returns `null` (shown via an `Empty` state) rather than a fabricated figure when the sample size is below a minimum threshold.
- Top paying businesses: all-time ex-VAT PAID revenue per business, with links through to the business record.
- Nav: "Membership" added under Revenue, between Finance and Money. Drill-down link added from the Growth page's existing "Drill down" card.
- Access restricted to `money.view`, same as Growth/Finance/Money.

**Still disclosed as not built:**
- Cancellation reason is not captured anywhere in the schema, so "why did they cancel" cannot be reported — disclosed on the page rather than guessed.
- LTV is observed-only (average of subscriptions that have already churned); it is never projected or forecast forward for still-active subscriptions.
- Advertising/partnership revenue, lead credits, cash balance/runway — unchanged from §3/§9/§11, still owned by later phases.

**Tests:** `scripts/test-membership.ts`, 8 tests covering `membershipMix`, `segmentByCategory`/`segmentByLocation`, `claimFunnel`, `monthlyCohorts`, `lifetimeStats` (including the below-minimum-sample `null` case), and `topPayingBusinesses`. Assertions were deliberately written to tolerate residual fixture data left behind by other scripts in the same `npm run test:unit` chain (e.g. `test-commerce.ts` and `test-growth-dashboard.ts` both leave cancelled/paid records behind after they finish) — they check the test's own fixtures' values and relative ordering rather than assuming a specific absolute rank or an exact global average. Wired into `npm run test:unit`. Full suite (21 scripts) passes with zero regressions; `tsc --noEmit` is clean.

**Gate to Phase 4:** awaiting your review and explicit go-ahead. Note: per §8, Phase 4 (lead analytics) depends on the lead-credit system in `LOCATION_AND_LEAD_SYSTEM_SPEC.md`, which is "designed, not built" (§3). Phase 4 cannot be implemented the same way as Phases 1–3 until that underlying infrastructure exists — this will need a scoping conversation before any Phase 4 work starts, rather than direct implementation against a system that doesn't exist yet.

## 13. Phase 5 delivery summary

**Phase 4 status:** deferred, by your choice, after scoping confirmed `LOCATION_AND_LEAD_SYSTEM_SPEC.md`'s credit/matching/delivery pipeline is still zero code and zero schema — the only lead-related data today is the bare `Lead` enquiry form (name/email/phone/message/status NEW–READ–ARCHIVED, no paid/assigned/delivered/valid concept at all). Building lead analytics against that would mean fabricating or misrepresenting metrics, so it was skipped in favour of Phase 5 rather than built on nothing.

**Schema change (applied to `dev`, not yet to `public`):**
- `scripts/ddl-sales-crm.ts` — explicit, idempotent, schema-qualified DDL (per `DATABASE_CHANGELOG.md` house rule 2). Adds `SalesEnquiry.assignedToId` (FK to `AdminUser`), `followUpAt`, `closedAt` (all additive, nullable, zero behaviour change for existing rows). Verified against `dev` via `information_schema`. **Production (`public`) has not been touched** — run `npx tsx scripts/ddl-sales-crm.ts --schema=public` when ready to ship, applying to `public` first per house rule 1.

**New Sales CRM module (`/admin/sales`):**
- `src/lib/sales.ts` — pipeline by stage (NEW/CONTACTED/WON/LOST counts), conversion/win-rate among closed deals only, average time-to-close in days (won vs lost), breakdown by interest type (premium/featured/advertising/sponsorship/other) with win rate per type, breakdown by assigned sales owner (open/won/lost/overdue follow-ups), and a list of overdue follow-ups sorted oldest-first.
- `/admin/sales` dashboard page, gated on `money.view` like Growth/Finance/Membership. Nav: "Sales CRM" added under Revenue, between Membership and Money. Drill-down link added from the Growth page.
- Existing enquiries list (`/admin/commerce/enquiries`) extended with an owner-assignment dropdown and a follow-up-date field per enquiry (`assignEnquiryOwner`, `setEnquiryFollowUp` actions in `commerce-actions.ts`). Marking an enquiry WON or LOST now stamps `closedAt`; moving it back out of either status clears it, so time-to-close stays accurate if a mistake is corrected.

**Still disclosed as not built:**
- **Customer acquisition cost** — explicitly shown as "not trackable" on the page. No ad-spend or marketing-cost record exists anywhere in the platform; computing a CAC would mean dividing by a cost that doesn't exist.
- Lead analytics (Phase 4) — deferred, see above.
- Advertising/partnership revenue in money terms, lead credits, cash balance/runway — unchanged from §3/§9/§11, still owned by later phases.

**Tests:** `scripts/test-sales.ts`, 7 tests covering `pipelineByStage`, `conversionStats`, `timeToClose`, `byInterest`, `byOwner` and `overdueFollowUps`. Following the lesson from Phase 3 (see repo memory and `scripts/test-membership.ts`), assertions against whole-table aggregates (`pipelineByStage`, `conversionStats`) use before/after deltas rather than exact global totals; `byOwner` and `overdueFollowUps` are tested exactly because a brand-new `AdminUser` fixture's assigned deals can never collide with pre-existing data. Wired into `npm run test:unit`. Full suite (22 scripts) passes with zero regressions; `tsc --noEmit` is clean.

**Gate to Phase 6:** awaiting your review and explicit go-ahead. Phase 6 (website/content analytics) needs GA4/Search Console credentials from the owner before it can be scoped — flagging this now so it isn't a surprise when that phase starts.

## 14. Phase 7 delivery summary

**No schema change.** The cash balance baseline reuses the generic `Setting` table (same pattern as the Phase 1 revenue target) — two new editable settings, `cash.starting_balance_pence` and `cash.starting_balance_date`, added to `/admin/settings`. Everything else is computed entirely from `revenueInRange()` and `recordedExpenses()` (growth.ts) and `expensesByCategory()` (finance.ts), so figures here never disagree with Growth or Finance.

**New Costs & cash flow module (`/admin/costs`):**
- `src/lib/costs.ts` — `cashBaseline()`/`currentCashEstimate()` (null until an admin sets a baseline, never a fabricated starting point), `monthlyNetCashFlow()` (6 months of revenue/expenses/net, oldest first, current month flagged incomplete), `burnRateAndRunway()` (average net over trailing complete months; runway in months only computed when burning **and** a baseline exists), `recurringCostRunRate()` (sum of `Expense.recurring=true` rows in the last complete calendar month — explicitly labelled a run-rate, not a contract-level forecast, since no contract end dates are recorded anywhere).
- `/admin/costs` page, gated on `money.view`. Nav: "Costs & cash flow" added under Revenue, between Sales CRM and Money. Drill-down link added from the Growth page.

**Still disclosed as not built:**
- **No bank feed.** The cash balance is a running calculation from a manually entered baseline, never reconciled against an actual account balance.
- Sponsorship revenue is counted when marked invoiced, not when actually paid — there is no payment-date field on `Sponsorship`, so the cash estimate assumes invoices are settled promptly. Flagged explicitly on the page.
- The expense ledger still only contains writer payments and manually entered `Expense` rows — any other real operating cost is simply absent from every figure here.
- Runway is only shown when the business is actually burning cash (negative average net) and a baseline has been set; otherwise it reads "not burning" or "not set" rather than a misleading number.

**Tests:** `scripts/test-costs.ts`, 9 tests covering the null-baseline case, reading back a configured baseline, `currentCashEstimate` (cross-checked against `revenueInRange`/`recordedExpenses` directly so the assertion is exact regardless of ambient data from other test scripts), `monthlyNetCashFlow`'s shape and completeness flags, and `burnRateAndRunway`/`recurringCostRunRate` using a deliberately oversized forced expense/delta-based assertions (per the Phase 3 lesson in repo memory, since these are also unscoped whole-table-range queries). Wired into `npm run test:unit`. Full suite (23 scripts) passes with zero regressions; `tsc --noEmit` is clean.

**Gate to Phase 8:** Phase 8 (outcomes & alerts) depends on Phases 1–7 being in place, which they now are. Phase 4 (lead analytics), originally deferred as blocked, has since been built — see §15. Its discovery (that the lead-credit/matching system exists, built by a separate process) means Phase 8 must be redesigned around `LeadAssignment.responseKind`/`respondedAt` rather than introducing a duplicate outcome model; this is not yet built, pending your review.

## 15. Phase 4 delivery summary

**Context:** this phase was originally marked "Deferred — confirmed blocked" on the grounds that the lead-credit/matching system was design-only. Mid-way through Phase 8 research, this was found to be false: `JobRequest`, `LeadAssignment`, `MatchDecision`, `CreditAccount`/`CreditTransaction` had all been built, schema and code, by a separate process outside the admin BI dashboard work (documented in `BATCH_LOG.md`, 26–27 Oct 2026) — a working customer-facing form (`/get-quotes`), an operational admin queue (`/admin/leads`), matching, credit purchase (via the existing Stripe pipeline, `Order.productKey = "lead-credits"`), and a one-click email response flow (`/lead/[id]/[token]`) all already existed and were already tested. Work paused immediately on discovering this, the user was informed, and Phase 4 was rebuilt against the real schema before Phase 8 resumed.

**No schema change** — every table this phase reads already existed.

**New Lead analytics module (`/admin/leads-analytics`):**
- `src/lib/lead-analytics.ts` — `jobFunnel()` (submitted → had supply → assigned → closed/rejected, by range), `responseStats()` (paid assignments: delivered/responded/called/declined/no-response, excluding sponsored placements since nothing was charged for them), `creditsSummary()` (credits purchased/spent/granted/reversed in range, plus a live low-balance-account snapshot), `matchDecisionBreakdown()` (every `MatchDecision` in range, grouped by stage/outcome — the audit trail behind the funnel). `demandWithoutSupply()` is re-exported from `src/lib/leads.ts` rather than duplicated.
- `/admin/leads-analytics` page: period filter (same presets as Growth), funnel metrics, business-response card, credits card, matching-decision breakdown, demand-without-supply table. Gated on `leads.view` (not `money.view`) — deliberately, since ADMIN role (not just SUPER_ADMIN) does day-to-day lead work and should see these figures, matching the existing `/admin/leads` page's gate.
- Nav: "Lead analytics" added under Directory, next to the existing "Leads" operational queue. Drill-down link added from the Growth page.
- **Prominently disclosed on the page itself**: production's `Place`/`JobRequest` tables are empty (the geography import has not been authorised), so every figure is dev-schema-only — proof the pipeline behaves correctly, not real customer demand.

**Bug found and fixed while building this** (not part of the original Phase 4 scope, but directly affects revenue figures already shipped in Phases 1–2): `revenueInRange()` (`src/lib/growth.ts`) was silently folding lead-credit purchase revenue into "Featured listings" — because credits are sold under their own product key (`CREDIT_PRODUCT_KEY = "lead-credits"`), deliberately not a row in `Product`, the old `kindOf.get(productKey)` lookup always missed and fell through to the `else` branch. The same function's `untracked` list simultaneously claimed lead credits were "not tracked" — both wrong. Fixed: `revenue.leadCredits` is now its own field, correctly populated and surfaced on both `/admin/growth` and `/admin/finance`'s revenue-by-source breakdowns; the false "not tracked" claim removed. `scripts/test-growth-dashboard.ts` updated — it was previously asserting the buggy behaviour as correct.

**Deliberately not built in this phase:**
- `leadsSubmitted()` in `growth.ts` still counts the old, separate `Lead` (Premium-enquiry) model, not `JobRequest` — left unchanged since Growth is already shipped and approved; flagged here rather than silently changed. Revisit with explicit sign-off if the Growth dashboard should count job requests instead of/alongside direct enquiries.
- A formal lead-validity/dispute/refund-review workflow (distinct from the existing automatic credit reversal on decline) is not built.
- Geography/category-level revenue attribution beyond the existing "demand without supply" breakdown (e.g. revenue per borough) is not built — would need the production `Place` import first to be meaningful.

**Tests:** `scripts/test-lead-analytics.ts`, 13 tests covering `jobFunnel`/`responseStats`/`creditsSummary`/`matchDecisionBreakdown` against real fixtures (a job with no supply, a job matched and responded to, a real credit purchase and spend), all via before/after deltas rather than absolute totals (per the whole-table-aggregate lesson in repo memory). Wired into `npm run test:unit`, last in the chain. `scripts/test-growth-dashboard.ts` gained 2 tests and one assertion fixed for the revenue bug above. Full suite passes (the one known pre-existing, unrelated flake in `test-search.ts`'s digest test — see repo memory — was not introduced by this phase and is out of scope). `tsc --noEmit` is clean.

**Gate to Phase 8:** awaiting your review and explicit go-ahead.

