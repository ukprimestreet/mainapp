# PrimeStreet — Project TODO

Legend: `[x]` done · `[ ]` open · `(blocked)` needs info/credentials. See `phases.md` for context.

## Phase 1 — Foundation + MVP Architecture

### Setup & docs
- [x] Inspect repo (empty — greenfield)
- [x] Write phases.md
- [x] Write projecttodolist.md
- [x] Scaffold Next.js + TS + Tailwind v4 + Prisma(SQLite)
- [x] Write docs/decisions.md (stack, URL architecture, SEO gating rules)
- [x] Write docs/brand.md (tokens, wordmark, PS icon, usage rules, contrast table)
- [x] Write README with run/seed/build instructions
- [x] .env.example with SITE_URL, DATABASE_URL

### Brand
- [x] Define single-source colour tokens (--prime-yellow etc.) in globals.css
- [x] Verify yellow/black contrast ratios and document
- [x] Choose + load typography (display + body) via next/font
- [x] Build Wordmark component (yellow-on-black, black-on-yellow, black-on-white, white-on-black)
- [x] Build PSIcon component + generate favicon (icon.svg, 16–512 PNG, apple-icon, PWA manifest)
- [x] Brand guide page /brand (internal reference, noindex)
- [x] Focus, hover, active states for buttons/links
- [x] Light-mode behaviour documented (dark sections only; user-toggled dark mode deferred)

### Database
- [x] City model (expansion-ready)
- [x] Location model (borough/neighbourhood, parent, city)
- [x] Category model (parent/child)
- [x] Business model (slug, claim status, sample flag, hours, services, socials)
- [x] Business slug generation + uniqueness
- [x] Author model
- [x] Article model (type, disclosure, status, publishedAt, SEO fields)
- [x] ArticleBusiness relation
- [x] PodcastEpisode model (linked to article for reuse)
- [x] ClaimRequest model (status workflow)
- [x] Review model with moderation status (schema only)
- [x] Seed script: 33 London areas, categories, sample businesses, authors, articles of all types, episodes
- [x] Mark all seed businesses/articles isSample and show marker in UI

### Core UI
- [x] Root layout, header (mobile nav), footer, skip link
- [x] Button, Badge (Unclaimed/Claimed/Sample/Disclosure), Card, Breadcrumbs, Section, EmptyState
- [x] Home page (hero, latest news, featured business, BOTW, locations, categories, stories, podcast, claim band)
- [x] /businesses index (+ simple category/area filter via query, noindex on filtered)
- [x] Business profile route /businesses/[location]/[category]/[slug] (check URL decision)
- [x] Unclaimed badge + "Is this your business? Claim this profile." CTA
- [x] /locations index + /locations/[slug]
- [x] /categories index + /categories/[slug]
- [x] /news, /stories, /interviews, /guides, /business-of-the-week hubs
- [x] Article page with disclosure label, author, related businesses
- [x] /podcast + /podcast/[slug]
- [x] /claim page + form with Zod validation + server action persisting ClaimRequest
- [x] /about
- [x] not-found + error pages
- [x] Empty states for every list

### SEO
- [x] Metadata helper (title template, description, canonical, OG)
- [x] sitemap.ts (only indexable pages)
- [x] robots.ts
- [x] JSON-LD: Organization (site), LocalBusiness, Article, BreadcrumbList
- [x] Thin-page rule: location/category pages noindex unless >= threshold businesses
- [x] Review/AggregateRating schema NOT emitted (no real reviews yet)

### Analytics foundation
- [ ] Analytics provider stub (env-gated) — events documented in docs/analytics.md; no tracker installed (consent decision pending)

### Testing
- [x] npm run build passes (typecheck + lint)
- [x] Smoke-test every route returns 200 / 404 as expected
- [x] Claim form: valid, invalid, duplicate-submission checks
- [x] Empty-state check (empty DB) — no 500s; verified 
- [x] SEO check: titles, canonicals, JSON-LD parses, sitemap, robots
- [x] Accessibility check: axe-core (WCAG 2.1 AA + best practice) on 17 pages × 375/1280 — clean (scripts/a11y.mjs). Lighthouse perf run still open
- [x] Responsive check at 375/768/1280: no horizontal overflow on 17 pages (scripts/a11y.mjs)
- [x] Final: acceptance criteria reviewed (see notes below)


### Phase 1 notes
- Seed data is FICTIONAL sample data (flagged, noindex). Real researched dataset + importer = Phase 2.
- Remaining Phase 1 gaps: Lighthouse perf run, analytics tracker, Search Console (blocked: needs owner Google access).
- Admin/auth intentionally deferred.

## Phase 2 — Business Directory

### Database
- [x] BusinessSubmission model (PENDING/APPROVED/REJECTED)
- [x] AuditLog model
- [x] Business.normName / websiteHost (dedupe) and Business.source (provenance)
- [ ] Photo gallery model + file upload (deferred: single imageUrl supported; needs storage decision — S3/R2/Vercel Blob)
- [ ] Structured OpeningHours / Service tables (currently JSON on Business; revisit with owner dashboard in Phase 5)

### Admin auth foundation
- [x] Signed, expiring, httpOnly session cookie (HMAC) — src/lib/auth.ts
- [x] Login page, brute-force throttle (5/15min), sign out
- [x] requireAdmin() on layout AND every admin server action
- [x] /admin noindex + robots disallow
- [x] ADMIN_PASSWORD / SESSION_SECRET env + .env.example
- [ ] Per-user admin accounts / roles (Phase 5)
- [ ] Persistent/distributed rate limiter (in-memory only; fine for one instance)

### Directory UX
- [x] Search by name/summary, category, area, claimed-only filters
- [x] Pagination (24/page, prev/next, page>1 and filtered URLs noindex)
- [x] Business image support on cards + profile (imageUrl)
- [x] Empty + out-of-range page states
- [x] Public 'Suggest a business' form (validation, honeypot, 3/day limit, URL sanitising)
- [ ] Filter by rating (needs Phase 4 reviews)
- [ ] Full-text/fuzzy search (Phase 8)

### Admin workflows
- [x] Dashboard with queue counts and real vs sample totals
- [x] Claims queue: approve (Claimed or Verified) / reject / request more info, with notes + audit log
- [x] Submissions queue: approve → unclaimed profile (duplicate-checked) / reject
- [x] Business list, edit form (validated, javascript: URLs blocked), publish/unpublish
- [x] Delete all sample businesses (danger zone; real data never touched)
- [ ] Email notifications to claimants/submitters (needs email provider credentials — blocked)

### Import tooling
- [x] CSV parser (quotes, CRLF, blank lines)
- [x] Row validation: original description >= 60 chars, mandatory source, URL/email/year checks
- [x] Category/area resolution with clear errors
- [x] Dedupe: name+area, website host, phone; within-file duplicates; idempotent re-import
- [x] Dry run vs apply, per-row report, audit log
- [x] Admin import UI (controlled field, file upload reads into text box)
- [x] data/businesses-template.csv + docs/data-sourcing.md (allowed/forbidden sources)
- [ ] (blocked) Real researched launch dataset of 150–300 businesses — requires human curation/owner-supplied data; the agent will not invent businesses
- [ ] (blocked) Original intro copy per launch borough so location pages can be indexed

### Testing
- [x] scripts/test-claim.ts (7), scripts/test-phase2.ts (23): importer, dedupe, helpers, submission, auth tokens, throttle
- [x] scripts/e2e.mjs (29 browser checks): login/logout, protection, claim→approve, submission→approve, edit, publish, import, pagination
- [x] scripts/a11y.mjs: axe + overflow on 17 pages
- [ ] Lighthouse performance run on production build
- [ ] Test on a real mobile device

### Phase 2 acceptance
- [x] Search works; submissions reach admin queue; claim workflow end-to-end in admin; import pipeline with dedupe
- [ ] Real dataset loaded (BLOCKED on content — see above). Phase 3 can proceed in parallel.


## Phase 3 — Editorial CMS

### Database
- [x] Article.imageAlt / imageCredit / sponsorName
- [x] Scheduling via publishedAt in the future (no extra status; public queries filter publishedAt <= now)
- [ ] Revision history / restore previous version (deferred: audit log records who/what/when only)
- [ ] Tags / series taxonomy (deferred to Phase 8 discovery)

### Admin CMS
- [x] Article list with search + type/status filters (Draft / Scheduled / Live)
- [x] New/edit article editor: title, standfirst, body, image, SEO fields, author, area, featured
- [x] Markdown-lite toolbar (H2/H3/bold/italic/link/quote/list/image) + live preview tab
- [x] Slug auto-generation + uniqueness validation
- [x] Save draft / Publish now / Schedule (London time, BST-safe) / Unpublish
- [x] Publish checklist panel + server-side enforcement
- [x] Business picker (admin-only search API) → ArticleBusiness links
- [x] Podcast episode link (content reuse)
- [x] Preview of drafts/scheduled pieces (admin-only, noindex)
- [x] Delete drafts only; live pieces must be unpublished first
- [x] Author management: create/edit/delete (blocked while they have articles)
- [x] Audit log entry for every article/author change
- [x] Dashboard tiles: drafts, scheduled
- [ ] Image upload (blocked on storage decision)
- [ ] Multiple admin users/roles (writer vs editor) — Phase 5 accounts

### Editorial integrity
- [x] Disclosure required: sponsor name mandatory for Sponsored/Partner/Advertorial
- [x] Reader-facing disclosure banner + badge; RSS labels non-editorial
- [x] BOTW cannot be sponsored; BOTW/Interview must link a business
- [x] Founder-owned business flag → automatic reader disclosure + editor warning
- [x] Editorial-balance warning (> 25 % of last 20 pieces founder-related)
- [x] Editing live pieces re-validates publish rules
- [ ] UI to toggle Business.ownedByFounder (currently set in the database; add to business edit form in Phase 5)

### Public
- [x] Rich article body renderer (safe: no HTML, scheme-checked links, nofollow ugc)
- [x] Hero image with alt + credit, reading time, author byline linking to author page
- [x] /authors/[slug] page + Person JSON-LD; noindex when only sample content
- [x] Related articles by shared business / area
- [x] Hub pagination (18/page)
- [x] /feed.xml RSS (real content only)
- [x] Article image in Article/NewsArticle JSON-LD
- [x] Sitemap includes authors with real published articles

### Content
- [x] docs/editorial-guide.md (workflow, integrity rules, formatting)
- [ ] (blocked on you) First real launch pieces: news, 2 stories, 2 interviews, 1 guide, 1 BOTW — need real reporting and consent
- [ ] Replace sample articles (admin can delete sample drafts; sample live articles must be unpublished first)

### Testing
- [x] scripts/e2e-editorial.mjs (49 browser checks): validation + state preservation, toolbar, drafts, preview, publish, XSS safety, JSON-LD, sitemap, RSS, author pages, sponsorship rules, unpublish, interview/BOTW/founder rules, scheduling (past/future/auto-live/London time), balance warning, deletion rules, API auth
- [x] axe + overflow audit extended to 9 admin screens incl. the editor (375/1280): clean
- [x] Claim form keeps typed values after server error

### Phase 3 acceptance
- [x] An editor can create, preview, schedule, publish, unpublish and delete each content type end-to-end without touching code
- [x] Integrity guardrails enforced server-side

## Phase 4 — Reviews

### Database
- [x] Review model rebuilt: status lifecycle, flags, hashed token/IP/email, edit + moderation timestamps, response fields
- [x] ReviewReport model (one per reporter per review)
- [x] EmailOutbox model
- [x] Business.ratingAvg / ratingCount (published only)
- [x] Unique (business, emailHash) = one review per person per business

### Submission & anti-abuse
- [x] Review form: accessible star radios, headline, body, name, email, guidelines + honesty declaration
- [x] Validation with field errors; typed values preserved
- [x] Signed form token (too-fast / stale / tampered refused)
- [x] Honeypot
- [x] Per-email (3/day) and per-IP-hash (5/day) rate limits
- [x] Disposable-email list; link/phone/shouting/duplicate-text/self-review/same-IP/burst signals
- [x] Raw IPs never stored; email never displayed
- [x] Sample businesses can't be reviewed
- [x] Duplicate submission → identical response (no enumeration) + fresh manage link, old link invalidated
- [ ] CAPTCHA/Turnstile (add if bot traffic appears; needs provider keys)
- [ ] Verified-customer signals (booking/receipt/Google sign-in) — future

### Email verification & reviewer control
- [x] Emailed manage link; token stored hashed
- [x] Confirm email via POST (prefetch-safe)
- [x] Edit review (live edits re-queued for moderation)
- [x] Hard delete incl. email address
- [x] Rejection / approval emails to reviewer
- [ ] (blocked) Real email delivery — needs RESEND_API_KEY + verified sending domain. Resend integration written, untested live. Admin → Outbox shows messages meanwhile

### Moderation (admin)
- [x] /admin/reviews with Pending / Reported / Held / Unverified / Published / Rejected tabs + counts
- [x] Publish / hide / restore / reject (reason required) / delete
- [x] Signals shown as chips; reports with reasons shown
- [x] Manual email-verify override (audit-logged)
- [x] Dismiss reports
- [x] Audit log for every action
- [x] Dashboard tiles: awaiting moderation, reported
- [x] Admin email outbox viewer

### Reporting
- [x] Report button on each published review (reason, details, 'I represent this business')
- [x] One report per IP per review; 10/day cap
- [x] Auto-hold at 3 distinct reporters; rating recalculated; moderator restores/rejects
- [ ] Verified business-owner reporting (Phase 5 accounts)

### Business responses
- [x] Public 'Response from {business}' block
- [x] Only on Claimed/Verified businesses; admin posts on owner's behalf
- [x] Businesses cannot edit/delete reviews
- [ ] Owner self-service response in dashboard (Phase 5)

### Public display, ratings & SEO
- [x] Reviews section: summary, distribution, list, reviewer name/date, '(edited)'
- [x] Rating badge on cards and profile header (screen-reader text, not colour only)
- [x] Directory: rating filter (3★+/4★+) and sort (top rated / most reviewed)
- [x] AggregateRating + Review JSON-LD only when real published reviews exist
- [x] Review/manage pages noindex + robots disallow
- [x] About page review guidelines
- [x] Long-text wrapping hardened (reviews, descriptions)

### Docs & testing
- [x] docs/reviews.md (lifecycle, abuse model, privacy, email)
- [x] scripts/test-reviews.ts (17 unit checks)
- [x] scripts/e2e-reviews.mjs (51 browser checks): bots, validation, verification, moderation, signals, XSS, reports/auto-hold, rate limits, responses, edit/delete, filters/sort, JSON-LD
- [x] axe + overflow audit extended to review form, profile with reviews, manage page, 5 admin review screens (3 viewports)
- [ ] Privacy policy + retention schedule page (needed before public launch)
- [ ] Load/abuse test with real traffic patterns; consider Turnstile

### Phase 4 acceptance
- [x] Abuse test cases pass (spam, duplicates, bots, rate limits, brigading protection, self-review signal, XSS)
- [x] No review is public without email confirmation + human approval
- [ ] Live email delivery verified (blocked on credentials)

## Phase 5 — Business Claiming

### Database
- [x] ClaimRequest extended: kind (CLAIM/DISPUTE), hashed status token, emailVerifiedAt, domainMatch, phone-code hash/attempts/verified, decidedAt
- [x] Owner (passwordless, sessionVersion), BusinessOwner (OWNER/MANAGER), OwnerLoginToken
- [x] BusinessEditLog (from → to per field, revertedAt)
- [x] ProfileChangeRequest, CoverageRequest, BusinessStat (daily views), Business.ownerUpdatedAt

### Claim flow & verification
- [x] Claim email confirmation (POST button, prefetch-safe); approval blocked until confirmed
- [x] Business-domain email detection (free-mail excluded, look-alikes rejected)
- [x] Phone call-back code (admin phones LISTED number; hashed, 48 h expiry, 5 attempts)
- [x] Claimant status page: evidence checklist, add information, withdraw
- [x] Needs-info loop (admin note emailed; claimant reply appended and re-queued)
- [x] Duplicate claim → same response + fresh link (old link dead)
- [x] Approval rules enforced server-side: CLAIMED needs email; VERIFIED needs domain match or phone proof
- [x] Competing claims auto-closed when one is approved
- [x] Approve / reject (reason required) / needs-info emails to claimant
- [x] Disputes: public report form, admin queue tag, uphold/dismiss
- [x] Revoke ownership (reason required, owners emailed, effective immediately on live sessions)
- [ ] Document-upload verification (blocked: file storage decision)
- [ ] Companies House lookup to cross-check director names (needs API key)

### Owner accounts & dashboard
- [x] Passwordless sign-in: emailed single-use 20-minute link, hashed token, POST-to-consume, no account enumeration, rate limits
- [x] Signed httpOnly session cookie (separate purpose from admin), 14 days
- [x] Sign out / sign out everywhere (sessionVersion)
- [x] Authorisation on every owner page + action via requireBusiness; 404 for non-owners
- [x] Dashboard: businesses, views (30 d, humans only), completeness %, unanswered reviews
- [x] Profile editor: validation, structured opening-hours editor, socials, services, image address; live immediately
- [x] Edit audit log + admin revert
- [x] Name/category/area change requests
- [x] Review replies (post/update/remove) and verified-owner reports; cannot edit/delete reviews
- [x] "Tell us your story" coverage pitches with status feedback; no-promise/not-for-sale wording
- [x] Profile view counter (bot UA filter, admin excluded)
- [ ] Photo upload (blocked: storage) — image address only
- [ ] Team members / invites (MANAGER role exists in the model)
- [ ] Email owners about new reviews / replies

### Admin
- [x] Claims & disputes queue with evidence panel, phone-code issuing, gated approve/verify
- [x] Owner inbox: change requests, coverage pitches, recent owner edits + revert
- [x] Business admin page: owners list + revoke, founder-owned toggle (deferred item from Phase 3 done)
- [x] Dashboard tiles; verified-owner reports flagged in review moderation

### Public
- [x] Claimed/Verified badges, owner socials, 'updated by the business' line, dispute link
- [x] Footer 'Owner sign in'; /owner, /claim/status, /claim/dispute noindex + robots disallow

### Docs & testing
- [x] docs/claiming.md
- [x] scripts/test-owner.ts (17 unit checks: tokens, domain match, hours, completeness, evidence rules, bot filter)
- [x] scripts/e2e-owner.mjs (~80 browser checks incl. tampered-form isolation, session revocation, single-use links, phone proof, disputes)
- [x] Old claim tests updated for the new flow
- [x] axe + overflow audit extended to claim status/dispute, owner login/dashboard/editor/reviews/coverage, admin claims/inbox/business (3 viewports)
- [ ] Penetration-style review of owner endpoints by a second person before launch

### Phase 5 acceptance
- [x] A claimed profile flips to Claimed/Verified with a full audit trail and the owner can manage it
- [x] Owners can only ever touch their own business (proved by tampering tests)
- [ ] Live email delivery (blocked on credentials) — claim confirmation and sign-in links depend on it

## Phase 6 — Local SEO Engine

### Quality gate (single source of truth)
- [x] src/lib/seo-engine.ts: decideLocation / decideCategory / decideLocCat / decideBusiness with human-readable "what it still needs"
- [x] Thin-profile rule (short description + no details/reviews → noindex)
- [x] Sample data never indexed or counted
- [x] Pages, sitemaps and admin health all use the same functions
- [x] Pagination ≥ 2 and filtered directory = noindex,follow (self canonical for pagination)

### Pages & internal linking
- [x] Area page rebuilt: intro block, category links, businesses (paginated 24), stories, other areas
- [x] Area × category page rebuilt: intro, paginated businesses, sibling area/category links
- [x] Category-in-city page rebuilt: intro, 'by area' links, other categories, pagination
- [x] Business profile: links to area×category, area and category pages
- [x] /categories/{slug} is a 308 to the canonical category page; no internal links point at it (audited)
- [x] City hub gated + breadcrumbs

### Metadata & structured data
- [x] Data-driven unique titles/descriptions per page type
- [x] BreadcrumbList on every page
- [x] CollectionPage + ItemList on listing pages (visible items only)
- [x] LocalBusiness: image, sameAs (website + socials), areaServed, openingHoursSpecification
- [x] Review/AggregateRating only from published reviews (kept from Phase 4)
- [x] Open Graph/Twitter on every page; branded generated OG images (site, profiles, articles)
- [x] Search Console + Bing verification via env vars

### Sitemaps & robots
- [x] /sitemap.xml index + chunked child sitemaps by type (5,000/URL file), real lastmod, empty groups omitted
- [x] Only gate-passing URLs; sample data excluded
- [x] robots.txt points at the index; admin/owner/review-manage/claim links disallowed

### Admin SEO controls
- [x] /admin/seo index-health table (counts, intro length, status, what's needed; filters)
- [x] Per-page overrides: title, description, original intro, AUTO/INDEX/NOINDEX (INDEX can't index empty pages)
- [x] SERP preview + character counters + validation
- [x] Redirect manager: add/delete, hit counts, loop/self/external/reserved refusals, chain collapse
- [x] Automatic 308 redirect when a business slug, article slug or article type changes
- [x] Business slug editing in admin (unique + validated)
- [x] redirectIfMoved() on dynamic pages + catch-all route; real 404s stay 404
- [x] SEO changes audit-logged

### Testing & quality
- [x] scripts/test-seo.ts (36 unit checks: gate matrix, overrides, metadata, redirect safety, sitemap XML)
- [x] scripts/seo-audit.mjs (~480 checks over a realistic fixture crawl, positive and negative cases)
- [x] scripts/e2e-seo.mjs (~40 browser checks: intro unlocks indexing, NOINDEX/INDEX overrides, redirect manager, auto-redirects on slug change)
- [x] axe + overflow audit extended to the SEO admin screens and new listing pages
- [x] Lighthouse mobile: perf 97 / a11y 100 / best-practices 100 (SEO score 66 on sample pages = intentional noindex)
- [x] Earlier Phase 1 gap closed: Lighthouse performance run

### Content / data (blocked on you)
- [ ] (blocked) Real launch businesses — areas/categories only become indexable with ≥ 3 real businesses
- [ ] (blocked) Write original intros (100+ chars each) for launch boroughs and categories via Admin → SEO
- [ ] (blocked) Verify the domain in Google Search Console + Bing Webmaster Tools and submit /sitemap.xml (needs your accounts)
- [ ] Review the index-health list monthly; prune/merge pages that stay thin

### Not done (deliberate)
- [ ] IndexNow / instant-indexing pings
- [ ] Image and news sitemaps
- [ ] Field Core Web Vitals (only available after launch)
- [ ] Multi-city URL structure (Phase 10)

### Phase 6 acceptance
- [x] No thin/empty page is indexable or in the sitemap; the rule is enforced in one place and tested both ways
- [x] Editors can unlock/force/hide pages and manage redirects without code
- [x] URL changes never create 404s
- [ ] Indexed landing pages exist (needs real data + intros)

## Phase 7 — Podcast + Video

### Database
- [x] PodcastEpisode rebuilt: season, type, show notes, transcript, chapters, audio url/size/mime/duration, video url, cover, explicit, guest, scheduling, timestamps
- [x] EpisodeClip (QUOTE / CLIP), EpisodeStat (daily views), EpisodePlay (deduplicated plays), PodcastShow (singleton settings)

### Admin
- [x] Episode list (status, media, duration, 30-day views + plays)
- [x] Episode editor: validation, slug auto-gen, live duration/chapter/video detection, business picker, article link, publish checklist
- [x] Save draft / publish / schedule (London time) / unpublish; delete drafts only; audit log
- [x] "Check file": SSRF-hardened HEAD probe fills file size + type
- [x] Show settings (title, description, author, owner email, category, language, cover, listen links)
- [x] Slug change on a live episode → automatic 308 redirect

### Repurposing workflow
- [x] Written interview draft generated from the transcript (Q&A), linked to episode + business
- [x] Quote cards: branded PNG per quote, downloadable, public when live (drafts admin-only)
- [x] Clip to-do list (time ranges, notes, done tick, produced-clip link)
- [x] Newsletter blurb + 3 social captions (templated, ≤ 280 chars)
- [x] Episode shows on the featured business profile and links to/from the article
- [ ] Automatic transcription / auto-cut clips (not built)
- [ ] Audio/video file upload (blocked: storage decision)

### Public
- [x] /podcast: show header, listen links, RSS, All/Video/Audio filter, pagination, autodiscovery link
- [x] Episode page: accessible player (skip ±15/30 s, speed, download, chapter buttons), video, show notes, highlights, article + business links, transcript, more episodes
- [x] Click-to-load video (YouTube-nocookie / Vimeo dnt / direct file): zero third-party requests until play
- [x] Draft / scheduled / sample episodes never leak (lists, feed, sitemap, profiles, articles)

### Feed
- [x] /podcast/feed.xml: RSS 2.0 + iTunes + Podcasting 2.0 (transcript, chapters), enclosure with length, stable guids
- [x] Only real published episodes with audio + size; ETag/304 + cache
- [x] /podcast/{slug}/transcript.txt and /chapters.json
- [ ] (blocked) Submit feed to Apple Podcasts / Spotify and validate with their tools — needs your accounts

### SEO & analytics
- [x] Episode quality gate (needs transcript or show notes ≥ 200 chars) shared with the sitemap; thin audio-only pages noindex
- [x] JSON-LD: PodcastEpisode (+AudioObject, chapter Clips), VideoObject, PodcastSeries; all visible on page
- [x] Episode OG image; quote-card images
- [x] Views counter (bots/admin excluded) and deduplicated play beacon (anonymous hash, same-origin, bots ignored)
- [ ] Listener geography/apps analytics (comes from the podcast host)

### Testing
- [x] scripts/test-podcast.ts (~50 unit checks: durations, chapters, video URLs, private hosts, RSS well-formedness + tags, transcript→interview, copy kit, episode gate, validation, SSRF probe vs a local server)
- [x] scripts/e2e-podcast.mjs (~85 browser checks: admin workflow, repurposing, player/chapters/speed, click-to-load privacy (request tracking), JSON-LD, feed/304/transcript/chapters, analytics, slug redirect, scheduling, thin-episode rule)
- [x] SEO audit extended (episode in sitemap, thin episode excluded, feed, schema)
- [x] axe + overflow audit extended to the episode page (player, chapters, facade, quotes, transcript), podcast index and admin podcast screens
- [x] Lighthouse mobile on an episode page: 97 / 100 / 100 / 100
- [x] Fixed along the way: PodcastShow find-then-create race (now upsert); safeUrl accepted `javascript:1` as host:port (now needs a dotted host)

### Content (blocked on you)
- [ ] (blocked) Record, host and enter real episodes; replace the sample episode
- [ ] (blocked) Cover art, show description, Spotify/Apple/YouTube links in Show settings
- [ ] (blocked) Transcripts for each episode (needed for search indexing and the written interview)

### Phase 7 acceptance
- [x] One interview can be published as podcast + video + written interview + quote cards + clip list + social copy without retyping
- [x] Feed is valid and complete for podcast apps; video is privacy-safe
- [ ] Real episodes live and feed submitted to directories (needs content + accounts)

## Phase 8 — Search + Discovery

### Search engine
- [x] SearchDoc + FTS5 index (title/tags/body, Porter stemming, prefix, bm25 weights) — SQLite-specific code isolated in lib/search/fts.ts
- [x] Incremental self-syncing index (id+updatedAt diff, throttled); drift detection; admin force rebuild
- [x] Businesses, articles and podcast episodes (incl. transcripts) indexed; drafts/unpublished/scheduled handled
- [x] Safe query builder (every token quoted; hostile input fuzzed), stop words, last-word prefix, domain synonyms
- [x] Strict AND → relaxed OR fallback with a visible notice
- [x] "Did you mean…" spelling suggestions from the site's own vocabulary
- [x] Filters: category, area, rating, claimed/verified, open now (London time)
- [x] Facet counts that exclude their own filter; sort (best match, rating, reviews, A–Z, nearest); pagination
- [x] /search page (results, facets, chips for matching categories/areas, stories, episodes); noindex + robots; no prefetch of query links
- [x] Header search box = accessible combobox with live suggestions (/api/search/suggest, rate-limited)
- [x] /businesses directory text search uses the same engine
- [ ] Semantic/vector search (not needed at this scale)
- [ ] Saved searches / alerts

### Near me
- [x] Browser geolocation (on demand) and UK postcode/outcode lookup (postcodes.io, configurable base URL)
- [x] Business coordinates from postcodes (bulk geocode in admin; auto re-geocode when a postcode changes)
- [x] Borough-centroid fallback marked "≈"; distance display; nearest sort; near-me with no search text
- [x] Location never stored; coordinates rounded; failure caching can't poison results (30 s) — bug found & fixed
- [ ] Map view (needs a tile/map provider decision)

### Related content & personalisation
- [x] Similar businesses (category, area, services, proximity, rating, claimed); sample/real never mixed
- [x] Related articles (shared business, area, type, title overlap, freshness) and related episodes
- [x] Save button on cards + profiles; /saved page; recently viewed (functional cookies, validated ids)
- [x] Recommendations on /saved and "Picked for you" on home from the visitor's own cookies (no accounts, nothing stored)
- [ ] Cross-device saved lists (would need visitor accounts)

### Analytics
- [x] Anonymous aggregate search log with zero-result counts; PII-looking queries dropped; prefetch renders not logged
- [x] Admin → Search: index stats, top searches, searches with no results, rebuild, geocode, purge old logs

### Newsletter
- [x] Footer sign-up (honeypot, timing, disposable block, per-IP limit), double opt-in with prefetch-safe confirm, no enumeration
- [x] HMAC unsubscribe links, one-click POST endpoint, List-Unsubscribe headers, re-subscribe flow
- [x] Weekly digest builder from REAL content only (refuses empty issue); edit, test send, confirmed send; atomic anti-double-send; sent issues locked
- [x] Admin → Newsletter: counts, sign-ups, issues, CSV export (formula-injection safe)
- [x] /privacy page (functional cookies, hashed IPs, location, newsletter, rights) — **draft for legal review**
- [ ] (blocked) Email delivery — needs RESEND_API_KEY + sending domain; until then Admin → Outbox
- [ ] Send queue for lists > 500; open/click analytics (deliberately omitted)
- [ ] Legal review of /privacy and the newsletter sender footer (NEWSLETTER_FOOTER)

### Quality
- [x] scripts/test-search.ts (~95 checks: text, hostile input, spelling, geo + mock postcode API, related scoring, cookies, newsletter tokens/CSV, full search integration on fixtures incl. facets, near-me, incremental sync)
- [x] scripts/e2e-search.mjs (83 browser checks: combobox keyboard/ARIA, facets, typos, synonyms, XSS, near-me (mock API + real geolocation), save/recommend/recent cookies incl. tampering, newsletter lifecycle, digest, one-click unsubscribe, CSV, admin tools, geocoding)
- [x] Test infrastructure fixed: login/form selectors in all suites made specific after header/footer gained forms; browser always closed on failure
- [x] axe + overflow audit extended to search (5 variants), saved, privacy, newsletter pages and admin search/newsletter (3 viewports); fixed 19px footer overflow
- [x] Lighthouse mobile: home 97/100/100/100; search 97/100/100 (SEO 63 = intentional noindex)
- [x] Bugs found & fixed: Escape cleared the search field (type=search) and made Enter search for nothing; prefetch rendered + logged searches; failed postcode lookups cached 24 h

### Phase 8 acceptance
- [x] Typed, misspelled, synonym and partial searches return relevant results quickly; hostile input is harmless
- [x] Filters, facets, sort, near-me and suggestions work and are keyboard/screen-reader accessible
- [x] Related and personalised content works without accounts or tracking
- [x] Newsletter is double opt-in, one-click unsubscribable and built from real content only
- [ ] Real email delivery (blocked on credentials) and legal review of the privacy notice

## Phase 9 — Growth + Monetisation (complete; live payments blocked on keys)
- [x] Products catalogue (admin-editable, seeded inactive at £0; can't activate without a price)
- [x] Premium profile: gallery (max 8, https), labelled offer, lead form, click analytics; no badge, no rating/review influence
- [x] Entitlements computed from the DB (7-day PAST_DUE grace); revoke hides features, data kept
- [x] Manual premium grants with mandatory note + audit log
- [x] Featured placements: labelled "Sponsored", max 2 per slot, fair rotation, targeting, caps, pause/end, founder disclosure; organic order never changes
- [x] Display ads: labelled "Advertisement", self-hosted, no third-party scripts, DB-only destinations, none inside sponsored articles
- [x] Sponsorship ledger → podcast "Sponsored by" + newsletter block
- [x] Tracked redirects/beacons (bots ignored, no open redirects); impressions humans only
- [x] Leads: honeypot, timing, rate limits, disposable-email refusal, owner email + inbox
- [x] Stripe over HTTP: checkout, billing portal, signed idempotent webhooks (replay-safe); mock-tested
- [x] /advertise page + sales enquiry pipeline in admin
- [x] Tests: unit (commerce) and e2e (128 checks)
- [ ] Stripe live keys, Price IDs, VAT/invoicing handling (blocked on user)
- [ ] Legal review of advertising terms

## Phase 10 - London Expansion + Future Cities (complete)
- [x] All 33 London boroughs plus ~50 real neighbourhoods (borough/neighbourhood tree, parent breadcrumbs)
- [x] City-scoped URLs `/locations/{city}/{area}/{category}` with 308 redirects from every pre-multi-city URL
- [x] Area slugs unique per city; categories remain one shared taxonomy
- [x] City model: status, intro, region, centre, postcode prefixes, launch date, ordering
- [x] COMING_SOON cities: browsable, honest, never indexed, impossible to force-index
- [x] Launch gate in admin (real businesses + 100+ char intro) and in the one SEO gate
- [x] Per-city editorial teams (`CityEditor`, roles) named on the city hub; articles carry a city
- [x] City-scoped search + city chooser (hidden while single-city); postcode to city detection
- [x] Admin: cities list with coverage, city detail with team and areas, automatic redirects on rename
- [x] Sitemaps gained a `cities` group; index-health covers city hubs
- [x] Tests: unit (39 checks) + e2e; docs/cities.md
- [ ] Second city launch needs real businesses and a reporter on the ground (blocked on the user)

## Supabase migration (done for dev schema)
- [x] Prisma → PostgreSQL, search → tsvector/GIN, case-insensitive filters, NULLS LAST rating sort
- [x] RLS on all tables (`npm run db:harden`), storage bucket `business-media`
- [x] All unit + e2e suites pass on Supabase (`dev` schema)
- [ ] Production schema + real data load; rotate shared keys/passwords; set MAIL_FROM (verified Resend domain) so email sends
- [ ] Owner photo upload UI using the storage bucket
