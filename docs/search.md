# Search, discovery & newsletter

## Search engine (`src/lib/search/`)
- **Index:** one `SearchDoc` row per business, article and podcast episode + an SQLite **FTS5** virtual table (`search_fts`: title, tags, body) with Porter stemming (cleaner/cleaning/cleaners match), accent folding and prefix indexes. All SQLite-specific SQL lives in `fts.ts`; for PostgreSQL swap that one file for a tsvector/GIN version (same exported functions).
- **What's indexed:** businesses (name; tags = category, area, services, areas served, postcode; body = summary + description), articles (title; tags = type, area, linked business names; body), episodes (title; tags = guest, business; body = description + show notes + transcript). Only published items; scheduled content becomes searchable at its publish time; drafts/unpublished/deleted items are removed.
- **Freshness:** `syncIndex()` diffs `id + updatedAt` against the index (cheap when nothing changed, throttled to once per 3 s) and re-indexes only what changed, so edits appear within seconds with no manual step. Admin → Search has *Rebuild search index* (force) and drift detection rebuilds automatically if the FTS table is ever lost.
- **Ranking:** bm25 with column weights (title 10, tags 4, body 1) × a small boost for claimed/verified profiles and rating. Strict AND of all words first; if nothing matches, relaxed to OR with a visible notice.
- **Query understanding:** stop words ("in", "best", "near", "london"…) are ignored; the last word is a prefix match; a domain **synonym map** (cleaner↔cleaning, removal↔movers, plumber↔plumbing, barber↔beauty, coffee↔cafes… editable in `text.ts`) widens recall; **"Did you mean…"** corrects typos using words that actually exist on the site (Damerau-Levenshtein ≤ 1–2 edits).
- **Safety:** user input is never passed to FTS raw: every token is quoted, so operators/`NEAR`/quotes/`*` are just words and syntax errors are impossible (fuzzed in tests). Results are HTML-escaped.
- **Filters & facets:** category, area, rating (3★/4★+), claimed/verified, **open now** (London time from published hours). Facet counts are computed *without* the facet's own filter so users can see what switching would give. Sort: best match, top rated, most reviewed, A–Z, nearest.
- **Suggestions:** header search box is an ARIA combobox (arrows/Enter/Escape, `aria-activedescendant`) backed by `/api/search/suggest` (businesses, categories, areas, articles, episodes; rate-limited). The directory (`/businesses?q=`) uses the same engine.
- **Search pages are `noindex`** (and disallowed in robots.txt): infinite near-duplicate URLs. Query links are `prefetch={false}` and prefetch renders are never logged.

## Near me
- **Browser geolocation** (only when the visitor presses "Use my location") or a **UK postcode** (full or outcode, looked up via postcodes.io; base URL configurable with `POSTCODES_API_BASE`). Coordinates are rounded to ~100 m, live only in the URL, and are never stored or logged.
- Distances use haversine. Businesses with their own coordinates show exact distances; others fall back to their **borough centroid** and are marked "≈". Coordinates come from postcodes: *Admin → Search → Geocode postcodes* (bulk, 100/call) and automatically when an admin/owner changes a postcode. Lookup failures are cached for 30 s only (so an outage can't poison results); definite 404s for a day.

## Related content & personalisation (no accounts, no tracking)
- **Similar businesses** (profile): category 4, area 3, shared services (≤ 3), proximity (≤ 2), rating, claimed bonus. Sample and real data never mix.
- **Related articles**: shared linked business 5, same area 3, same type 1, title-word overlap 1.5/word, freshness ≤ 1. **Related episodes**: same business / same guest, then newest.
- **Saved & recently viewed**: first-party *functional* cookies (`ps_saved`, `ps_recent`) holding business IDs (validated; max 50/12). `/saved` renders server-side from them; **recommendations** ("You might like — because you saved X") and the home page's **Picked for you** are computed on the fly from those lists; nothing is stored about the visitor.

## Analytics
Anonymous aggregate search log (`SearchTerm`: day + normalised query + count + zero-result count). No IPs/user IDs; queries that look like emails, phone numbers or URLs are never stored. Admin → Search shows top searches and **searches with no results** (what to add or which synonym to create). Purge button for logs older than 90 days.

## Newsletter
- **Sign-up** (footer): honeypot, timing check, disposable-address block, 5 sign-ups/hour/IP, **double opt-in** (confirm by pressing a button — link scanners can't subscribe someone), identical response whether or not the address exists (no enumeration, no emails to already-subscribed addresses).
- **Unsubscribe**: every email has a personal HMAC link (no login) and RFC 8058 `List-Unsubscribe` + one-click POST endpoint. Unsubscribed addresses can re-subscribe (re-confirmation).
- **Digest**: Admin → Newsletter → *Build this week's digest* assembles stories, latest episode and new businesses from the last 7 days from **real content only**; refuses to create an empty issue. Edit → *Send test* (to the admin) → *Send now* (needs a confirmation tick; atomically marked sent so double-clicks can't double-send; sent issues are locked). CSV export of active subscribers (formula-injection safe).
- **Limits/blockers:** delivery needs an email provider (`RESEND_API_KEY` + `MAIL_FROM`); until then messages are only recorded in Admin → Outbox. Up to 500 recipients per issue until a queue exists. `NEWSLETTER_FOOTER` should hold the legal sender identity/address.

## Privacy
`/privacy` explains reviews, claims, newsletter, hashed IPs, analytics, location and the two functional cookies. **It is a draft for legal review before launch.**

## Not done
Vector/semantic search, per-category filters beyond the facets, saved searches and alerts, per-user accounts for saved lists (would enable syncing across devices), a send queue for large lists, open/click tracking (deliberately omitted for privacy).
