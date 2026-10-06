# Architecture decisions

1. **Greenfield stack:** Next.js 16 App Router + TypeScript + Tailwind v4 + Prisma 6. Server components by default; pages are `force-dynamic` for now (DB-backed). Move to ISR (`revalidate`) once content volume/traffic justifies it.
2. **Database:** SQLite for dev (zero setup). For production switch `provider` in `prisma/schema.prisma` to `postgresql` and set `DATABASE_URL`. Enums are stored as strings, validated in `src/lib/constants.ts`, to keep the schema portable. Search currently uses `contains`; Phase 8 adds full-text search.
3. **No external CMS:** articles live in the DB (`Article`, typed + disclosure level) so one interview can link to a `PodcastEpisode`, a written `Article` and a `Business`.
4. **URLs:**
   - Business profile: `/businesses/{city}/{category}/{slug}` (one canonical URL; wrong category/city → 308 to canonical).
   - Category in city: `/businesses/{city}/{category}`; `/categories/{slug}` redirects there.
   - Area: `/locations/{area}` and `/locations/{area}/{category}` (only exists when businesses exist).
   - Editorial: `/news`, `/stories`, `/interviews`, `/guides`, `/business-of-the-week`, `/insights`, each with `/{slug}`.
   - `/businesses/{area}` (as in the brief) was NOT used: it collides with `/businesses/{city}`. Areas live under `/locations`. Multi-city expansion = more `City` rows.
5. **SEO gating (anti-thin-page):** location/category pages are `noindex` unless ≥ `MIN_BUSINESSES_TO_INDEX` (3) real businesses (and, for locations, an original `intro`). The sitemap lists only indexable pages. Filtered/search directory URLs are `noindex` with canonical to the clean URL.
6. **Sample data:** all seeded businesses/articles/episodes are fictional and flagged `isSample`. They show a visible "Sample data" badge, are `noindex`, and are excluded from the sitemap. Real researched data replaces them in Phase 2 (importer). Never invent facts about real businesses.
7. **Schema.org:** Organization (site), LocalBusiness (profile, only visible facts, no rating), Article/NewsArticle, BreadcrumbList, PodcastEpisode. `AggregateRating`/`Review` are intentionally not emitted until real published reviews exist.
8. **Claim flow:** server action + Zod; honeypot, per-email rate limit (3/h), duplicate-pending check; business becomes `PENDING`. Admin approval queue is in /admin/claims (Phase 2); owner access to edit the profile is Phase 5.
9. **Editorial integrity:** `Article.disclosure` (EDITORIAL/SPONSORED/PARTNER/ADVERTORIAL) renders a mandatory banner + badge for non-editorial content; `Business.ownedByFounder` triggers an automatic disclosure on any article featuring that business.
10. **Admin auth (Phase 2):** single shared password + HMAC-signed expiring httpOnly cookie, checked in the admin layout and in every server action. Per-user accounts arrive with owner dashboards (Phase 5).
11. **Claim approval:** approving sets CLAIMED, or VERIFIED when the admin confirms identity independently. Owner dashboard access is Phase 5.
12. **Provenance & dedupe:** every imported business stores a mandatory `source`; duplicates are detected by normalised name+area, website host, or phone.
13. **Forms and React 19:** uncontrolled fields reset after a server action, so forms echo submitted values back (or use controlled state) to avoid data loss.
14. **Scheduling without cron:** a scheduled article is just PUBLISHED with a future `publishedAt`; every public query filters `publishedAt <= now`, so it appears automatically. Times are entered in Europe/London and stored as UTC. Trade-off: sitemap/feed reflect it on next request; add revalidation tags if ISR is introduced.
15. **Editor state:** the article editor is fully controlled client state so React 19 form-reset cannot lose work after a failed save. Rules live in `src/lib/editorial.ts` and are enforced server-side; the client checklist is a convenience mirror.
16. **Rich text format:** Markdown-lite rendered by React (no HTML pass-through) instead of a WYSIWYG/HTML editor — safe by construction and portable to newsletter/podcast show-notes later.
17. **Images:** URL + alt + credit now; uploads wait on a storage decision (S3/R2/Blob).
18. **Reviews are human-moderated, never auto-published.** Soft signals route to moderators; only the distinct-reporter count auto-HOLDs (hide, not delete), so brigading can hide a review only temporarily. See docs/reviews.md.
19. **Email abstraction:** all mail goes through EmailOutbox plus optional Resend. Chosen over SMTP libraries to avoid dependencies; delivery is the one unverified piece.
20. **Hard delete for reviewer deletions** (data minimisation) rather than soft delete; ratings are recalculated.
21. **IPs** are stored only as salted hashes (SESSION_SECRET). Rotating the secret resets rate-limit memory and the same-IP signal.
22. **Passwordless owners.** Email is already the proof of identity for claims and reviews, so owner sign-in is a one-time emailed link: no password storage/reset surface. Cost: owners need working email (same dependency as reviews).
23. **Owner edits are live + audited + revertible** rather than pre-moderated: moderating every typo would not scale; admins see a feed and can revert. Name/category/area need a human.
24. **Evidence rules live in code** (`claimEvidence` in lib/owner.ts) and are enforced in the server action, so the UI can't be bypassed.
25. **404 not 403** for another owner's business pages, to avoid revealing which businesses exist/are claimed.
26. **One quality gate.** SEO indexability is computed in one module and consumed by pages, sitemaps and admin so the three can't drift. Overrides are explicit and audit-logged; INDEX can never index an empty page.
27. **308 not 301.** Next's permanentRedirect issues 308, which search engines treat as a permanent redirect and which preserves the method. Redirects are chain-collapsed and loop-checked on write.
28. **Sitemap index + own route handlers** instead of Next's sitemap.ts, to get a real index file, per-type files and chunking.
29. **Catch-all route for moved URLs.** A lowest-priority `[...missing]` route resolves the Redirect table or returns a genuine 404; dynamic routes also call `redirectIfMoved` because they would otherwise 404 before reaching it.
30. **Original intro is the unlock.** The cheapest way to make an area/category page genuinely useful (and indexable) is human-written copy; the admin makes that the visible next step.
31. **Audio is linked, not hosted.** Podcast hosting is a solved problem (bandwidth, range requests, stats); we link to an https file and read size/type with a hardened HEAD probe. Upload waits on the storage decision.
32. **Click-to-load video, no thumbnails.** Not even a thumbnail is fetched from YouTube/Vimeo until play: better privacy (no consent banner needed for the embed itself) and performance (Lighthouse 97).
33. **Plays are deduplicated anonymously** (salted hash of IP + episode + day, unique key) rather than counting every play event or setting cookies.
34. **Episodes are indexed only with text** (transcript/show notes ≥ 200 chars): audio-only pages are thin to a search engine.
35. **Repurposing is deterministic templating, not AI generation**: transcript → Q&A draft, quote cards, captions come from the editors' own words, so nothing invented is published.
36. **Search = SQLite FTS5 behind one file.** No external search service at this scale; FTS5 gives stemming + bm25 + prefix. The engine is isolated so PostgreSQL (tsvector) or Meilisearch can replace `fts.ts` later without touching callers.
37. **Self-healing index.** Rather than hooking every write path (admin, owner edit, import, reviews…), the index diffs `updatedAt` on demand. Cheaper to reason about and impossible to forget a write path.
38. **Personalisation without accounts.** Saved/recent lists are functional cookies of business IDs; recommendations are computed from them per request. This avoids tracking, consent banners and a visitor-account system while still delivering "saved businesses".
39. **Search is noindex.** Result pages are near-infinite duplicate URLs; SEO value comes from curated listing pages (Phase 6). Search logs are anonymous aggregates.
40. **Near-me is honest about precision.** Exact distance only with real coordinates; otherwise borough-centroid distance marked "≈".
41. **Newsletter content is assembled, not generated:** only real published content from the last week; empty weeks send nothing.
42. **Money never buys trust.** Premium/featured/ads can't alter ratings, reviews, organic order, "Similar businesses" or add a trust badge. Paid placements are always labelled and sit in separate slots.
43. **Entitlements derive from the DB, not the browser.** Prices, products and destinations are server-side; Stripe webhooks are HMAC-verified, timestamp-bound and idempotent via StripeEvent.
44. **Tracked redirects take no URL parameters.** `/go/*` looks up the destination in the DB, so they can't be open redirects; bots are not counted.
45. **Sample businesses can't be sold to or promoted.** Fictional data never appears as paid inventory.
46. **Ads are first-party only.** No third-party ad scripts (privacy, performance, editorial control); no ads inside sponsored articles (one label per piece).
47. **Products ship inactive at £0** so nothing can be sold by accident; VAT/invoicing must be addressed before live payments.
48. **Moved from SQLite to Supabase Postgres.** One raw-SQL file (`lib/search/fts.ts`) was the only engine-specific code; search is now tsvector/GIN. Text filters use `mode: "insensitive"` to keep SQLite's behaviour.
49. **Dev/test live in a separate `dev` schema; RLS on every table** so the exposed anon key can never read data. Service-role key is server-only.
