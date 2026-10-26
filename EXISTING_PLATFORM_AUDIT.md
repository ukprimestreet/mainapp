# Existing platform audit

**Audit date:** 26 October 2026 · **Auditor:** Phase A, batch A1 · **Method:** direct inspection of the repository, the Prisma schema, the running production deployment and the live Supabase database. Nothing in this document is assumed; where something could not be verified it says so.

**Written for:** the engineers and the product owner implementing the lead-generation extension.

---

## 1. What this platform already is

PrimeStreet (primestreet.uk) is a working London business media and directory platform: a business directory with claiming and reviews, an editorial operation with its own writers' desk, a podcast, a newsletter, a local-SEO engine and three signed-in dashboards. It is live, deployed, and holds real content.

**This is not a greenfield build.** The lead system must extend it.

### Stack, verified

| Layer | What is actually there |
|---|---|
| Framework | Next.js **16.3.8**, App Router, React **19.3**, TypeScript, server components and server actions |
| Styling | Tailwind v4, one design system in `src/components/dash/` plus `src/components/ui.tsx` |
| ORM / DB | Prisma **6.19.3** → **Supabase Postgres**. Two schemas: `dev` (development and tests) and `public` (production) |
| Search | Postgres full-text (tsvector + GIN) in `search_fts`, maintained by `src/lib/search/` |
| Hosting | Vercel, region `dub1`, auto-deploy from GitHub `main` plus CLI deploys. Account `ukprimestreet-6381`, **Hobby plan** |
| Email | Resend HTTP API, no SDK. Nine per-purpose senders in `src/lib/mail.ts` |
| Payments | Stripe over plain HTTPS in `src/lib/billing.ts`, **no Stripe SDK dependency** |
| Scheduling | One Vercel cron → `/api/cron`, daily at 09:30 UTC, gated on `CRON_SECRET` |
| Tests | 15 unit suites (`npm run test:unit`), 10 e2e suites (puppeteer-core on Edge), axe-core a11y + overflow audit |

Database: **54 Prisma models**, row-level security enabled on every table in both schemas.

---

## 2. Business registration and onboarding — how it works today

There are **three** routes by which a business ends up on the platform, and they are not equivalent.

### a. Editorial import (the main route so far)
`scripts/import-launch-content.ts` and `/admin/import`. Facts are researched from the company's own website and written in our own words. Governed by `docs/data-sourcing.md`, which admits a business **only when its own site publishes both a full address and a telephone number**. Production currently holds 3 businesses this way.

### b. Public submission — `/businesses/submit`
Writes a `BusinessSubmission` row (status `PENDING`), reviewed in `/admin/moderation`. Captures: name, **category** (select, canonical slug), **area** (select, canonical slug), address, postcode, phone, website, description, submitter name/email, `isOwner`. Anti-spam: honeypot + form token.

### c. Claiming an existing listing — `/claim`
`ClaimRequest` → admin approval → `grantOwnership()` creates an `Owner` and a `BusinessOwner` link. Evidence model in `claimEvidence()`: email verification is required to approve; a business-domain email **or** a phone call-back code is required to reach `VERIFIED`. Documented in `docs/claiming.md`.

**Finding:** there is **no self-service "register my business" flow that creates a live listing directly.** Every route passes through admin review. The lead system's onboarding requirements (mandatory location, service areas, credit grant) must therefore attach to either (b)+approval or (c)+claim, or a genuinely new owner-facing registration flow must be built. **This is an architectural decision for the owner — see the spec, §2.**

---

## 3. Location data — the single most important finding

### What exists

```
City (1 row: london, status LIVE)
 └── Location (83 rows)  kind = BOROUGH (33) | NEIGHBOURHOOD (50)
      └── parentId → Location   (50 of 83 have a parent)
```

`Location` fields: `id, slug, name, kind, intro, cityId, parentId, lat, lng`. `@@unique([cityId, slug])` — a slug is unique **within a city**, deliberately, so two cities can each have a "richmond".

`Business` carries exactly one `cityId`, one `locationId`, one `categoryId`, plus `address`, `postcode`, `lat`, `lng`, `geoSource` (`POSTCODE | AREA | MANUAL`) and `areasServed` — **a free-text/comma-separated string, not a relation.**

### Why this does not yet meet the requirement

| Requirement (prompt §3, §4) | Current state | Gap |
|---|---|---|
| UK-wide: England, Wales, Scotland, NI | One city, London. `City.region` and `City.country` exist but are decorative | The hierarchy is **city-first**, not country-first. A Newbury business has no valid home |
| Country → region → county → local authority → town → locality | Two `kind` values only: BOROUGH, NEIGHBOURHOOD | Needs an open `kind` vocabulary and more levels |
| Canonical identifiers per level, not just names | No GSS/ONS codes stored anywhere | Must add. See §4 below — they are free |
| Alternative names and aliases | None | Must add |
| Prevent duplicates from alternative spellings | `normName` exists on `Business`, nothing on `Location` | Must add |
| Structured service coverage | `areasServed` free text | Must become a join table |
| Multiple categories per business | `Business.categoryId` — exactly one | Must become a join table |

**`Category`**: 12 rows, all top-level. The self-referential tree (`parentId`) exists but is unused. No synonym/alias mapping, which prompt §5 requires ("a customer searching for a painter should be matched to painting and decorating").

### Postcode resolution — verified live, and the news is mixed

`src/lib/geo.ts` already calls **postcodes.io** (free, Open Government Licence) but uses it **only for latitude and longitude**. I called it during this audit for `RM10 7AA`:

```
country         England
region          London
admin_district  Barking and Dagenham      (E09000002)
admin_ward      Eastbrook & Rush Green    (E05014059)
parish          Barking and Dagenham, unparished area
outcode/incode  RM10 / 7AA
```

**Good news:** country, region, local authority and ward — with ONS GSS codes — are already available at no cost from a provider we are already integrated with. That satisfies "store the canonical identifiers for each geographical level" for the upper levels.

**Bad news, and it is material:** postcodes.io returns a **ward**, not a locality. For RM10 7AA it gives "Eastbrook & Rush Green" — it does **not** return "Dagenham" as a town or "Dagenham Dock" as a locality. Wards do not map cleanly onto the local place names this project is built around (Becontree, Chadwell Heath, Rush Green, Beam Park).

Therefore:
- **Postcode → upper hierarchy: solved, free.**
- **Postcode → locality: not solved.** Needs a place-name dataset (OS Open Names, OGL, free) plus a nearest-place or point-in-polygon step, and the result must be treated as a *suggestion the business confirms*, never as a silent inference. This is exactly what the prompt warns against: "Do not infer a locality from postcode text alone."
- **Postcode → selectable list of real addresses: not possible with any free source.** Address-level lookup needs Royal Mail PAF or OS AddressBase, which are licensed and chargeable. **Owner decision required — see §7.**

---

## 4. The existing enquiry ("lead") system

A `Lead` model already exists, and it is **not** what the new system needs.

```prisma
model Lead {
  id, businessId → Business, name, email, phone?, message,
  status  "NEW" | "READ" | "ARCHIVED",
  ipHash, createdAt
}
```

- Created by `submitLead()` in `src/app/businesses/lead-actions.ts`, from a form on a **single business's profile page**.
- **Premium-gated**: `if (!(await isPremium(business.id)))` the form refuses.
- It is a **direct message to one business**. One row, one recipient, no matching, no category, no location, no consent record, no credits, no assignment lifecycle.
- Emails every linked owner via `sendTemplate("new-enquiry", …)` with **Reply-To set to the customer**, so the owner replies straight to them.

**Anti-abuse already built and worth reusing verbatim:** honeypot field, form-token with a 3-second minimum fill time, disposable-email rejection, and three rate limits — 10 per IP per day, 3 per email per business per day, 20 per business per hour. Plus `ipHash` rather than raw IP storage.

**Finding:** the new system needs a customer-facing, service-and-location-led job request that fans out to **up to two paying businesses**. That is a different shape from `Lead`. The existing `Lead` rows and the Premium enquiry feature are in use and must keep working — see the spec for the migration position.

`SalesEnquiry` is a separate thing again: inbound interest in *advertising with us*, not a customer job request. Leave it alone.

---

## 5. Payments — the strongest part of the existing platform

No Stripe SDK. `src/lib/billing.ts` talks to the Stripe REST API over HTTPS, with `STRIPE_API_BASE` overridable so tests run against a local mock.

```
Product (key, kind, pricePence, interval, durationDays, stripePriceId, active)
   ↓ createCheckout()
Order (PENDING → PAID | FAILED | REFUNDED, stripeSessionId @unique)
   ↓ Stripe → POST /api/stripe/webhook
verifyStripeSignature(raw body, 300s tolerance)
   ↓ StripeEvent.create(event.id)   ← idempotency: duplicate event ids are dropped
processEvent() switches on product.kind:  PREMIUM → Subscription | FEATURED → Campaign
```

Events handled: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.

**This is directly reusable for lead credits.** A new `kind = "CREDITS"` product and one new branch in `processEvent()` gets a verified, idempotent credit purchase with no new payment infrastructure. The hard parts — raw-body signature verification, event de-duplication, order lifecycle — are already solved and tested.

**Blocker:** Stripe is **not configured in production**. `vercel env ls production` shows no `STRIPE_SECRET_KEY` and no `STRIPE_WEBHOOK_SECRET`, and all four `Product` rows have `pricePence = 0` and `active = false`. Credit purchasing cannot go live until the keys and real Stripe prices exist.

Also already present and reusable: `src/lib/secretbox.ts`, AES-256-GCM field encryption with key rotation, currently protecting writer bank details. The same pattern suits anything sensitive the lead system stores.

---

## 6. Users, roles and permissions

Three separate signed-in audiences, three separate HMAC-signed cookies, each with its own purpose prefix so a token for one can never be replayed as another:

| Audience | Cookie | Authentication | Model |
|---|---|---|---|
| Admin | `ps_admin` | **One shared password** from `ADMIN_PASSWORD` + `ADMIN_EMAIL` | **No table. No individual admin accounts.** |
| Business owner | `ps_owner` | Passwordless: single-use emailed link, 20-minute expiry | `Owner`, `BusinessOwner`, `OwnerLoginToken` |
| Writer | `ps_author` | Password (scrypt), set from an emailed invitation | `Author`, `AuthorLoginToken` |

Owner authorisation funnels through one checkpoint, `requireBusiness()` in `src/lib/owner.ts`, which 404s rather than 403s so it never reveals that a business exists. Team access is all-or-nothing: **every manager of a listing sees everything, including billing.** There are no partial permissions.

**Finding, and it blocks a stated requirement.** Prompt §10 says "Use role-based permissions to restrict access to customer contact details" and §18 test 31 requires that an unauthorised user cannot reach admin lead details. With a single shared admin password there is **no way to distinguish one administrator from another**, so per-role restriction of customer PII is currently impossible, and the audit log can only ever record "admin" rather than *which* admin. Introducing individual admin accounts is a prerequisite, not a nice-to-have. **See the spec, §2.**

---

## 7. Notifications

- **Email**: `src/lib/mail.ts`, nine per-purpose senders (`accounts`, `editorial`, `enquiries`, `reviews`, `claims`, `digest`, `billing`, `alerts`, `hello`). Only `hello@` is monitored; every other sender states plainly that nobody reads replies. Verified live in production: `email: configured`.
- **Outbox**: every send is recorded in `EmailOutbox`, visible at `/admin/outbox`, which also gives delivery-failure visibility.
- **Templates**: 26 general + 23 business lifecycle templates, each carrying its trigger and commercial goal in code. One branded table-based layout, `src/lib/email/layout.ts`.
- **In-app**: `Notification` model with `audience` = `AUTHOR | OWNER | ADMIN`, and `src/lib/notify.ts`. **The `OWNER` audience is defined but unused** — business owners currently get email only. The lead system should use it.
- **Consent**: `src/lib/email/consent.ts` separates `service` / `lifecycle` / `marketing`, with a 14-day marketing frequency cap and unsubscribe tokens. Urgent lead notifications are `service` mail.
- **SMS / WhatsApp**: **no provider integrated.** Prompt §13 lists these as optional; treating them as in scope means a new vendor, cost and consent capture.

### Scheduling — a hard blocker on the 3-minute escalation

The platform has exactly one scheduled job: `/api/cron`, **daily** at 09:30 UTC, defined in `vercel.json` and authenticated with a bearer `CRON_SECRET` (it answers 404 whether the secret is wrong or simply unset, so it never falls back to open).

Prompt §11 requires unassigned-lead escalation after a **configurable three minutes**. The project is on the **Vercel Hobby plan, where cron jobs are limited to once per day.** A three-minute heartbeat is therefore **not achievable on the current plan.** Options are in the spec, §6.

---

## 8. Admin dashboard

`/admin` with grouped navigation — Overview / Editorial / Directory / Revenue / Reach / System — covering 20+ pages including `/admin/moderation` (one queue replacing four), `/admin/money`, `/admin/automations`, `/admin/audit` and `/admin/commerce`. Built on the shared dashboard system, axe-clean at 375px and 1280px.

A **New Leads** feature slots naturally into the Directory or a new Leads group. `AuditLog` (`action`, `targetType`, `targetId`, `detail`, `createdAt`) already exists and is used for money and moderation decisions — reusable for assignment history, though see §6 on its inability to name an individual admin.

**Automations** (`src/lib/automations.ts`) is a close precedent for lead distribution and worth copying: every rule **off by default**, a per-run `dailyCap`, `alreadySent()` de-duplication through the outbox, a dry run that lists real recipients before anything sends, and a stop-everything button.

---

## 9. Testing, standards and deployment

- **Unit**: 15 suites, plain `tsx` scripts with a `PASS`/`FAIL` tally, run against the `dev` schema. ~501 checks.
- **E2E**: 10 suites, puppeteer-core driving Edge against `next start`.
- **A11y**: axe-core (WCAG 2.1 AA + best practice) at 375/768/1280, plus an overflow check that asks whether the page *actually* scrolls sideways.
- **Conventions observed in the code**: British English in all user-facing copy; comments explain *why*, not *what*; honest empty and error states; no third-party client scripts; server-side authorisation at a single checkpoint per audience.
- **Deployment**: push to `main` auto-deploys. **Schema changes must be applied to `public` before the code that reads them ships** — this project has already taken one production outage from getting that order wrong.
- **`prisma db push` is not safe against production here.** Pointed at `schema=public` it was observed inspecting `dev` through the Supabase transaction pooler and offering to drop dev's `search_fts`. Production DDL is applied with explicit, schema-qualified `ALTER TABLE` statements and verified per schema afterwards.

### Production environment, verified

Set: `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `SESSION_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `MAIL_DOMAIN`, `MAIL_SUPPORT`, `CRON_SECRET`, `FIELD_KEY`, `NEXT_PUBLIC_SITE_URL`.

Not set: **anything Stripe**.

---

## 10. What production actually contains

3 businesses, 6 articles (not in a published state — `/news` shows none), 9 search documents, 0 owners, 0 newsletter subscribers, 0 automations enabled. Development holds 40 businesses and 83 locations.

**Implication for the pilot:** there is currently **no provider supply**. A lead system with no businesses to route to will produce leads nobody can service. Supply comes before demand — this shapes the pilot recommendation in the spec, §8.

---

## 11. Audit conclusions, ranked by how much they affect the plan

1. **Scheduling blocks the 3-minute escalation.** Hobby plan = daily crons only. Needs a decision.
2. **Stripe is not live.** Credit purchase cannot ship without keys and real prices.
3. **No individual admin accounts**, so role-based restriction of customer PII and per-admin audit attribution are impossible today.
4. **The geography model is London-shaped and city-first.** A UK-wide hierarchy is a redesign, not a widening — and existing rows must migrate without breaking live URLs.
5. **Postcode → locality is unsolved**, and postcode → *address* requires a licensed, paid dataset.
6. **`Lead` is single-recipient**, `areasServed` is free text, and `Business.categoryId` allows only one category. All three need structural change while the existing features keep working.
7. **No provider supply in production**, which constrains any pilot.
8. **Reusable and strong**: the payment pipeline, the anti-abuse controls on the existing enquiry form, the email and outbox infrastructure, the automations pattern, the dashboard system, `secretbox.ts`, and the audit log.

---

## 12. Documents referenced but not found

`UK_Local_Services_Lead_Generation_SEO_Master_Plan.docx` — required reading by the second prompt, §2. **It is not in the repository.** I searched the whole tree. Per that section's own instruction I am not pretending to have read it: **please provide it** before the standalone lead-generation site's Phase 0 begins. Everything in this audit concerns the first prompt, whose Phase A does not depend on it.

Existing documents that are the equivalents the prompts ask for, and should be updated rather than duplicated: `phases.md` (platform phases 1–11), `projecttodolist.md` (platform task history), and the 17 files in `docs/`.
