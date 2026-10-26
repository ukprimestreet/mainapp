# PrimeStreet — Development Roadmap

> London's Businesses. Stories. People.

Repository state at start: **empty directory** (greenfield). Stack decisions are recorded in `docs/decisions.md`.

**Stack:** Next.js (App Router, TypeScript) · Tailwind CSS v4 · Prisma ORM · SQLite (dev) → PostgreSQL (production, one-line provider change) · Zod validation · server components by default · no CMS vendor (content lives in our own DB so it can be reused across formats).

**Content-integrity rule for all phases:** no fabricated businesses, reviews, news or quotes may ever be shown as real. Sample data is flagged `isSample` and shown with a visible "Sample data" marker until replaced by researched real entries.

---

## Phase 1 — Foundation + MVP Architecture
**Objective:** a launchable skeleton that already feels alive: brand, IA, schema, UI kit, publishable content, browsable directory, SEO basics.
- **Features:** home, businesses index + profile, locations index + page, categories index + page, content hubs (news, stories, interviews, guides, business-of-the-week), article page, podcast index/episode page (read-only), claim CTA + claim page (form UI + persisted request), about, 404.
- **Technical:** Next.js scaffold, Prisma, seed script, CSV business importer (design), shared layout, env config, `docs/`.
- **Database:** Business, Category, Location, Article (typed: NEWS/STORY/INTERVIEW/GUIDE/BOTW/INSIGHT; disclosure: EDITORIAL/SPONSORED/PARTNER/ADVERTORIAL), Author, ArticleBusiness (M:N), PodcastEpisode, ClaimRequest, Review (schema only), City (expansion-ready).
- **UI/UX:** brand tokens (Prime Yellow), wordmark component, PS icon, header/footer, cards, badges, buttons, breadcrumbs, empty states, focus states.
- **SEO:** metadata per page, canonical, sitemap.xml, robots.txt, JSON-LD (Organization, LocalBusiness, Article, BreadcrumbList), thin-page noindex rule.
- **Content:** launch-ready sample articles of every type, sample directory across categories/areas (flagged).
- **Acceptance:** `npm run build` passes; every route renders with seed data and empty states; claim form validates and stores; unclaimed badge + CTA on every unclaimed profile; sitemap lists only indexable pages; brand tokens single-source; favicon/PS icon generated; a11y basics (focus, contrast, landmarks, alt).
- **Dependencies:** none. **Risks:** scope creep; sample data mistaken for real → mitigated by visible flag.
- **Before Phase 2:** acceptance met; todo updated; docs current.

## Phase 2 — Business Directory
**Objective:** a directory worth using.
- Search + filters (category, area, rating, claimed), pagination, business submission form (moderated queue), CSV import tooling with dedupe, real seed dataset, admin auth foundation, opening hours/services UI, photos upload.
- **DB:** BusinessSubmission, Photo, OpeningHours, Service, AdminUser/Session.
- **SEO:** noindex for thin filtered pages; canonical for filters.
- **Acceptance:** real researched dataset loaded (target 150–300 quality profiles); search works; submissions reach admin queue.
- **Risks:** data quality, licensing of scraped data (use only owner-submitted/public-fact data; never copy descriptions).

## Phase 3 — Editorial CMS
Admin UI to write/edit/publish Article, Author, scheduling, drafts, preview, image handling, markdown/blocks editor, disclosure labels enforced, related-business linking, editorial-integrity guardrails (founder-owned business flag + disclosure).
**Acceptance:** an editor can publish each content type end-to-end without touching code.

## Phase 4 — Reviews
Rating + review submission, one-review-per-user-per-business, rate limiting, honeypot/captcha, moderation queue, report-review flow, business responses, edit window, audit log, AggregateRating schema only when real reviews exist.
**Risks:** fake reviews, defamation. **Acceptance:** abuse test cases pass.

## Phase 5 — Business Claiming
Verification (email-domain match, phone callback code, document upload, manual review), admin approve/reject/request-info, owner accounts, owner dashboard to edit profile, respond to reviews, request coverage.
**Acceptance:** claimed profile flips to Verified with audit trail.

## Phase 6 — Local SEO Engine
Programmatic-but-quality-gated location/category/location×category pages (index only when ≥ N real businesses + original intro), internal linking, breadcrumbs, sitemap index, canonical rules, redirect manager, SEO overrides per page, Search Console integration.

## Phase 7 — Podcast + Video
Episode model completion, RSS feed, embedded players, transcripts, interview → multi-format repurposing workflow (podcast, video, article, clips, quotes), PodcastEpisode schema.

## Phase 8 — Search + Discovery
Full-text search (Postgres FTS / Meilisearch), related businesses/articles, "near me", newsletter, saved businesses.

## Phase 9 — Growth + Monetisation
Featured listings, premium profiles, sponsored content with mandatory labels, ads, Stripe subscriptions, lead gen, newsletter sponsorship, analytics dashboards.
**Status: complete (live payments await Stripe keys).**

## Phase 10 — London Expansion + Future Cities
**Status: complete.** All 32 boroughs + City of London covered, `City` model already live → additional cities, multi-city routing (`/{city}/…`), per-city editorial teams.

## Phase 11 — The three dashboards, and the operations behind them
**Status: complete.** One dashboard system serving admin, writers and business owners, built to the standard of a modern banking app: grouped dark navigation, server-computed inline-SVG charts, dense comparable series, and axe-core clean at 375px and 1280px.

Admin gained the automations control panel, money, one moderation queue in place of four, corrections, the audit log, settings, and the commissioning and payment screens that make the writer dashboards work. Writers gained commissions, performance, payments, in-app notifications and the style guide. Owners gained insights, photos, offers, billing, team, opening hours and help, behind a business switcher.

The money rules are enforced in code rather than stated in a policy: a fee is agreed before the work and never moved afterwards, delivering a commission is the only thing that creates money owed, approving is not paying, and every decision is in the audit log.

A daily job at `/api/cron` runs the enabled automations and prunes orphaned search rows. It refuses to run without `CRON_SECRET` and answers 404 whether the secret is wrong or simply unset, because an endpoint that can trigger a marketing send must never fall back to being open.

**Acceptance:** every page clean under axe at both widths, 15 unit suites green, and nothing sends without an admin having switched it on.

---
### Cross-phase standards (Definition of Done)
Implemented · works · tested · edge/empty/error states · usable on mobile · fits architecture · docs updated · `projecttodolist.md` updated.

---

# Lead-generation platform (separate programme)

Location-aware registration, automated lead distribution, lead credits and admin lead management, plus the
service-and-place landing pages. Source documents: `docs/UK_Local_Services_Lead_Generation_SEO_Master_Plan.docx`,
`docs/UK-WIDE LOCAL SERVICES LEAD-GENERATION PLATFORM.txt`, `nextbigprojectforprimestreet.md`.

Planning lives in `docs/leadgen/` and the four root documents (`EXISTING_PLATFORM_AUDIT.md`,
`LOCATION_AND_LEAD_SYSTEM_SPEC.md`, `DATABASE_CHANGELOG.md`, `PROJECT_TODO.md`). Batch history: `BATCH_LOG.md`.

**Governing rule: at most three landing pages per authorised batch, and a full stop after each one.** It is a
ceiling, not a target. The risk is Google's scaled-content and doorway policies, which act against a whole
domain rather than individual pages — and this domain carries real editorial worth protecting.

## Lead Phase A — audit and architecture
**Status: complete** (batches A1, A2, A3). Platform audited against the live database and deployment; lead,
geography and credit models designed; migration order and rollback recorded; planning documents created.
**Acceptance:** every claim verified rather than recalled, and every unknown named as an unknown.

## Lead Phase B — geography and onboarding
`Place` / `PlaceAlias` / `PlaceLink`; back-fill the 83 existing locations; `Business.placeId` alongside
`locationId`; ONS and OS Open Names import under licence; postcode resolution as a confirmable suggestion;
cascading manual selectors; mandatory location in onboarding; structured service areas; multiple categories
per business with synonym mapping.
**Risks:** breaking indexed URLs; duplicate places from spelling variants. **Acceptance:** 100% of existing
rows mapped, no live URL changed, no place created without a source and a date.

## Lead Phase C — lead creation and admin oversight
`JobRequest` with versioned consent and idempotency; the customer job-request form reusing the existing
anti-abuse controls; `/admin/leads` showing every lead immediately; lead detail with the full match and
notification history.
**Acceptance:** a lead appears in admin the moment it exists, and a double-submit creates one row.

## Lead Phase D — matching and assignment
Four-stage expansion; every decision recorded with a reason; **two paying businesses per lead enforced by a
database constraint**; round-robin allocation; manual admin assignment with paid and sponsored types.
**Acceptance:** concurrent processing cannot produce a third paid assignment; reprocessing charges nobody twice.

## Lead Phase E — credits and payments
Credit ledger; five free credits once; atomic reserve/confirm/reverse; `CREDITS` product through the existing
Stripe pipeline; purchase UI.
**Blocked on:** Stripe keys in production, and the VAT decision. **Acceptance:** duplicate webhooks grant
nothing; a failed assignment leaves no charge.

## Lead Phase F — notifications and escalation
Urgent assignment email; owner in-app notifications; low and zero credit emails, de-duplicated; immediate
escalation when nobody is eligible; delayed escalation via **Supabase `pg_cron`**, because Vercel's Hobby plan
schedules once a day and cannot serve a three-minute threshold.
**Acceptance:** no duplicate escalation alerts; a lead stays visible when email delivery fails.

## Lead Phase G — pilot, measurement and release
One service in one area, with **providers recruited before any customer form goes live**. Privacy notice and
business terms reviewed by a qualified adviser. Analytics and Search Console in place, or the pilot cannot be
judged. Existing directory, reviews, listings and Premium enquiries verified unaffected.
**Acceptance:** the whole commercial loop runs end to end for one real enquiry, and a provider says they would
pay for the next one.
