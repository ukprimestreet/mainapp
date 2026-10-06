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
All 32 boroughs + City of London covered, `City` model already live → additional cities, multi-city routing (`/{city}/…`), per-city editorial teams.

---
### Cross-phase standards (Definition of Done)
Implemented · works · tested · edge/empty/error states · usable on mobile · fits architecture · docs updated · `projecttodolist.md` updated.
