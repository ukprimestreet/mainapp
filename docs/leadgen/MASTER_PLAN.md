# Master plan — UK local services lead generation

**Version:** 0.1 · **Date:** 26 October 2026 · **Phase:** 1 (research methodology and planning). No landing pages exist.

**Source documents:** `docs/UK_Local_Services_Lead_Generation_SEO_Master_Plan.docx` (v1.0, 25 Oct 2026), `docs/UK-WIDE LOCAL SERVICES LEAD-GENERATION PLATFORM.txt`, `nextbigprojectforprimestreet.md`. Platform facts come from `EXISTING_PLATFORM_AUDIT.md`.

**Written for:** the engineers and the owner. It states what we are building, what we have decided, and what is still unknown — and it marks the difference.

---

## 1. Vision

People searching for a local trade should find a page that genuinely answers their job, understand what happens next, and send one enquiry. That enquiry reaches up to two local businesses who can actually do the work, who contact them directly.

Two things make or break it, and neither is page count:

- **Does the enquiry get serviced?** A lead nobody answers is worse than no lead, because the customer blames us.
- **Would the business pay for it again?** That is the only measure of lead quality that matters.

## 2. Revenue model

| Stream | Mechanism | Status |
|---|---|---|
| **Lead credits** | £1 per credit. One credit per paid lead assignment. 5 free credits once per business | Designed, not built. VAT undecided (D4) |
| Premium listings | Existing subscription product | Built; Stripe not live |
| Featured placement | Existing campaign product | Built; Stripe not live |
| Sponsorship / advertising | Existing `SalesEnquiry` pipeline | Built |

Listing in the directory and buying leads stay **separate concepts**. A business can list free forever and never buy a credit. That is a deliberate commercial choice: a directory that forces payment to appear loses the coverage that makes it worth reading.

## 3. Customer acquisition

Organic search, through pages built for a real service in a real place. Nothing else is funded yet.

The mechanism is deliberately narrow: **three landing pages per authorised batch, maximum.** Not a target — a ceiling. The risk being managed is Google's scaled-content and doorway-abuse policies, which can act against the whole domain, not just the thin pages. PrimeStreet already carries real editorial and a live directory; losing the domain's standing to chase location pages would be the most expensive mistake available here.

## 4. Local SEO strategy

- **One canonical page per search intent.** Three phrases with the same intent get one strong page, not three competing ones.
- **A page exists only if the service can genuinely be delivered there** and the page can say something useful about that place. A keyword existing is not a reason.
- **Nothing is indexed by default.** The platform already has this gate: `src/lib/seo-engine.ts` refuses to index a location or category page without real businesses and an original intro, and a `COMING_SOON` city can never be forced indexable. The lead pages inherit it.
- **Browseable structure**, not orphaned pages — a location index and service/area navigation, so pages are reachable by a human and not only by a sitemap.
- Structured data only where it is accurate and the page is eligible.

## 5. Lead qualification and distribution

Full design in `LOCATION_AND_LEAD_SYSTEM_SPEC.md`. Summary:

1. Customer submits a job request → resolved to a canonical place and category.
2. Matching expands in four stages: exact place → parent town/borough → wider administrative area → nearby opt-in only.
3. Eligibility: category match, active listing, declared coverage, credit balance, not already assigned, fewer than two paid slots taken.
4. **At most two paying businesses per lead**, enforced by a partial unique index in Postgres, not by application logic alone.
5. Every inclusion and exclusion is recorded with its reason.
6. If nobody is eligible, escalate to an administrator **immediately** — there is nothing to wait for.

## 6. Technical architecture

Built **on** PrimeStreet, not beside it. Next.js 16 App Router, Prisma 6, Supabase Postgres, Vercel, Resend. Reused rather than rebuilt: the Stripe pipeline (signed webhooks, `StripeEvent` idempotency), the existing enquiry form's anti-abuse controls, the email and outbox infrastructure, the automations pattern, the dashboard system, `secretbox.ts`, `AuditLog`.

### Scheduling — decided

**Supabase `pg_cron` for anything Vercel cannot schedule.** Verified on our instance on 26 October 2026: `pg_cron` 1.6.4 and `pg_net` 0.20.4 are available (not yet installed), Postgres 17.11, no `cron` schema present. Vercel's Hobby plan runs crons once a day, which cannot serve a three-minute escalation; `pg_cron` schedules at minute granularity inside the database we already pay for.

Division of labour:

| Job | Where | Why |
|---|---|---|
| Daily automations, search pruning | Vercel cron → `/api/cron` | Already built and working |
| Unassigned-lead escalation | **Supabase `pg_cron`** → `pg_net` POST to a secret-gated endpoint | Needs minute granularity |
| Notification retries | **Supabase `pg_cron`** | Same |

Enabling the extensions is an owner action in the Supabase dashboard (Database → Extensions). Our role is `postgres`, not superuser, but holds `supabase_privileged_role`; whether it can `CREATE EXTENSION` directly will be confirmed at implementation rather than assumed.

**The immediate-escalation path is built first and needs no scheduler at all.** When matching finds nobody eligible there is nothing to wait for, so most of the value lands before any cron exists.

## 7. Geographic coverage strategy

**England first**, with a documented route to the rest of the UK when approved — the master plan is explicit, and it is the narrower, safer reading of the first prompt's "UK-wide".

Today the platform holds one city (London), 83 locations, two place types. That is a redesign, not a widening: see `GEOGRAPHY_SCHEMA.md`.

Sources: ONS geography for codes and administrative hierarchy, OS Open Names for place names, both under their licences; Royal Mail PAF or OS AddressBase **only if licensed** (D2). postcodes.io already gives country, region, local authority, ward and GSS codes free — but **not** towns or localities, so postcode-to-locality remains an unsolved step requiring a place-name dataset and human confirmation.

## 8. Service prioritisation

50 categories in `SERVICE_RANKING.csv`, transcribed from the master plan with their keyword scope. **Every scoring column is empty and every row reads `UNVERIFIED`.** The order is a planning hypothesis; the master plan says so itself, and there is no public dataset that ranks every local service category by demand, urgency, job value and lead sellability together.

Scoring model, to be applied once there is evidence: search demand · high-intent demand · local competition · average lead value · urgency · recurring demand · **provider supply** · willingness to buy leads · seasonality · conversion potential · regulatory risk · liability risk. Nine categories are already flagged for regulatory review (gas, electrical, pest control, MCS, OZEV, healthcare, legal).

**Provider supply is weighted heavily on purpose.** A category with huge search demand and no providers who will buy leads produces traffic and no revenue.

## 9. Conversion strategy

One enquiry form, short, mobile-first, reusing the anti-abuse controls already proven on the Premium enquiry form. Honest copy: the platform collects an enquiry and introduces providers — it does not book jobs, quote prices, or confirm that anyone has accepted. Every claim on a page must be substantiable for that place at that time.

No invented reviews, no fabricated response times, no false scarcity, no "trusted local experts" we cannot evidence.

## 10. Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| **No provider supply** | Production has 3 businesses and 0 owners. Leads nobody services destroy trust on the first enquiry | Recruit 3–5 real providers in one service × area **before** any form goes live |
| Scaled-content / doorway action | Could affect the whole domain, including the real editorial | Three-page ceiling; existing indexation gate; a page only exists if it is useful |
| Sharing PII without lawful basis | Regulatory exposure, and it is the customer who is harmed | Versioned consent, recipients only, retention rules, legal review before launch |
| Two-business limit lost to a race | Breaks a hard commercial promise | Database-level constraint |
| Geography migration breaking indexed URLs | Loses the search visibility we already have | Additive migration; `Location` retained; redirects verified first |
| Pilot that proves nothing | New region + new system at once means you cannot tell which half failed | Pilot on geography that already exists (D6) |

## 11. Success metrics

Tracked from the first pilot page, not retrofitted: impressions, clicks, query coverage, indexed valid pages · form start, form submit, valid enquiry rate · contactability, serviceability, duplicate and spam rate, provider acceptance, booked-job rate · revenue per lead, margin per lead, repeat credit purchases, refund and dispute rate, provider retention · pages passing QA, thin-page rate, privacy requests, form-delivery failures.

**More indexed pages is not a success metric.** It is the thing most likely to be mistaken for one.

## 12. Current phase and next milestones

**Phase 1 — planning.** Documents created; no code, no pages, no schema change.

Immediate next, in order:

1. Owner decisions **D2 (address lookup), D3 (admin accounts), D4 (VAT), D5 (registration flow), D6 (pilot area)**. D1 (scheduling) is **decided: Supabase `pg_cron`**.
2. Batch B1 — geography foundation: `Place` / `PlaceAlias` / `PlaceLink`, back-fill the 83 existing locations, add `Business.placeId` without reading it.
3. Recruit pilot providers. This is a business task, not an engineering one, and it gates everything after B1.
4. Keyword research for the chosen pilot pairing, with real tool access.

Phase plan: `phases.md`, "Lead-generation platform" section. Task list: `PROJECT_TODO.md`. Batch history: `BATCH_LOG.md`.
