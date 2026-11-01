# Technical SEO checklist

**Date:** 26 October 2026 · Status reflects what is **already verified working on PrimeStreet** versus what the lead pages will need. Platform items were confirmed during the audit, not assumed.

---

## Already built and working

| Item | Where | Note |
|---|---|---|
Crawlable, stable URLs | city/category/location routing | One canonical URL per business, enforced by `permanentRedirect` when the path is wrong |
Canonical tags | `generateMetadata` per route | |
Sitemap index + groups | `/sitemap.xml`, `/sitemaps/[name]` | Includes a `cities` group |
Robots directives | per-route `robots` metadata | Dashboards are `noindex, nofollow` |
Redirect manager | `Redirect` model, `redirectIfMoved()` | 308s from every pre-multi-city URL |
**Indexation gate** | `src/lib/seo-engine.ts` | A location or category page is **not indexable** without real businesses and an original intro. A `COMING_SOON` city can never be forced indexable, even with a manual override |
Breadcrumbs + JSON-LD | `breadcrumbLd()` | |
Structured data | `LocalBusiness`, `NewsArticle`, `PodcastEpisode`, `AggregateRating` | Rating schema emitted **only** when real moderated reviews exist |
`openingHoursSpecification` | business profile | Fixed 12 Oct 2026 — the filter had been matching the literal string `dd:dd-dd:dd`, so hours had never reached structured data |
`specialOpeningHoursSpecification` | business profile | Holiday hours now reach search engines |
Accessibility | `scripts/a11y.mjs` | axe-core WCAG 2.1 AA + best practice at 375/768/1280, currently clean |
Responsive | same script | Overflow measured by whether the page **actually** scrolls sideways |
Mobile-first | Tailwind, no client charting libraries | No third-party client scripts at all |
SEO overrides per page | `SeoPage` model, `/admin/seo` | |
Index-health view | `/admin/seo` | |

## Needed for the lead pages

| Item | Status | Note |
|---|---|---|
Service × place route design | **NOT STARTED** | URL shape must be decided before the first page. Proposal: `/services/{service}/{place}` |
Page-type decision per intent | **NOT STARTED** | Depends on keyword research; three phrases with one intent get one page |
Cannibalisation map | **NOT STARTED** | `KEYWORD_DATABASE.csv` + `PAGE_QUEUE.csv` hold the keyword→URL mapping; check before every page |
Internal linking: service ↔ place, parent ↔ child | **NOT STARTED** | Required so pages are not orphaned doorways |
Browseable location/service index | **NOT STARTED** | Same reason |
`noindex` until QA passes | **NOT STARTED** | New pages start non-indexable and are promoted deliberately. The existing gate gives us the mechanism |
Sitemap eligibility rule for lead pages | **NOT STARTED** | Only canonical, QA-passed, indexable URLs enter the sitemap |
`Service` structured data | **NOT STARTED** | Only where accurate; must not imply the platform performs the work |
Form analytics: start, submit, qualified | **NOT STARTED** | **No analytics provider is installed at all** — see below |
Search Console verification | **NOT STARTED** | Needs the owner's Google account. Blocks all first-party query data |
Core Web Vitals monitoring | **NOT STARTED** | |
Form-delivery monitoring | **PARTIAL** | `EmailOutbox` records every send and `/admin/outbox` shows failures. No alerting |
Error monitoring / uptime | **NOT STARTED** | |

## Two gaps worth stating plainly

**There is no analytics installed.** `docs/analytics.md` has been a plan since Phase 1 and remains one: no tracker, pending a cookie-consent decision. Event names are already fixed so the data is consistent when it arrives. Consequences: conversion rate, form-start versus form-submit, and cost per lead **cannot be measured today**. A lead platform that cannot measure its conversion rate cannot be optimised, so this needs resolving before the pilot is judged — not after.

**Search Console is not verified.** Impressions, clicks, query coverage and ranking trends are all unavailable until it is, and it needs the owner's Google account. Without it, keyword research for later batches has no first-party evidence and relies entirely on third-party estimates.

## Rules that apply to every lead page

1. One primary intent per page. Supporting terms used naturally, never a repeated block written for a crawler.
2. Unique title and meta description. No keyword stuffing in either.
3. One descriptive `h1`, logical heading order.
4. Location-specific content only where verified. **No invented local facts, landmarks, or "local projects".**
5. No fake reviews, accreditations, response times, prices or guarantees.
6. The page says what the platform actually does: collects an enquiry and introduces providers. It does not book, quote or confirm.
7. If the page cannot say anything genuinely useful about that service in that place, it is **not created**. The intent is merged into a stronger page, and the decision is recorded.
8. Nothing is indexed automatically.

## Pre-publication QA, per page

Content factually checked · no invented local detail · keyword targeting and cannibalisation checked against the queue · internal and external links tested · form submission and validation tested · responsive at 390 and 1440 · axe clean · metadata and canonical correct · robots and indexation state correct · sitemap eligibility correct · analytics events firing (once analytics exists) · lead storage and routing verified end to end.

## The quality gate, after decision D7 (1 November 2026)

**Supply is not the test. Substance is.**

A location, category or location × trade page is indexed when either of these is true:

- it has **original editorial copy** of 100 characters or more about that area or trade, or
- it has **three or more real published businesses**, whose listing is the substance by itself.

Either is enough. Neither being true means the page stays out — not because it has no suppliers, but
because it has nothing on it.

**What changed and why.** The gate used to require three real businesses *and* an intro, and refused a page
with zero businesses even when an administrator forced it. The owner's instruction is that a job arriving
from an area we do not cover is a job they source a provider for, so a page must not wait on listings to be
findable. `MIN_BUSINESSES` is gone as a condition; `SUBSTANTIAL_LISTING` is what the count means now.

**What was deliberately kept.** Thousands of near-identical pages with nothing on them is what gets a whole
directory demoted, and seven boroughs × ~700 localities × 18 trades is 88,000 URLs. The substance test is
what keeps that number down to the pages worth having: today the sitemap holds **70 indexable URLs**, up from
48, and every one of the new ones has either real copy or a real listing behind it.

**Private pages are not affected and never will be.** A customer's own job request, the confirmation pages,
the one-click response link, `/owner` and `/admin` all carry `noindex` and are excluded from the sitemap.
Indexing one person's enquiry would publish their name and phone number.

**The 18 trade categories now have real intros** (`npm run geo:intros`), written to a rule: no invented
prices or averages, only checkable facts — Gas Safe, Part P, waste carrier registration, Building
Regulations — and written for somebody about to hire a trade rather than for a crawler. Nothing in them
claims we have businesses in any particular area.

**An empty category page is not a dead end.** It says it has no listings yet, and offers the quote form,
because somebody who landed there wants the work doing.
