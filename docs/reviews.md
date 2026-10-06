# Reviews: design, policy and abuse model

## Lifecycle
`UNVERIFIED` (email not confirmed) → `PENDING` (awaiting moderator) → `PUBLISHED` | `REJECTED`. `PUBLISHED` ⇄ `HELD` (hidden after reports / by a moderator). **Nothing is public until a person publishes it.**

## Submission (public, `/review/{slug}`)
1. Rating 1–5, optional headline, body 40–2000 chars, display name, email. Sample (fictional) businesses can't be reviewed.
2. Anti-abuse: signed form token (refuses submits <4 s after render or >4 h stale), hidden honeypot, per-email (3/24 h) and per-IP-hash (5/24 h) limits, one review per person per business (DB unique), IPs stored only as salted hashes.
3. Email confirmation link (`/reviews/manage/{token}`; only a SHA-256 of the token is stored). Confirming is a **POST button** so link-scanning email gateways can't confirm on someone's behalf.
4. Re-submitting for the same business gives the *same* success message and re-sends the manage link (no account enumeration; the old link is invalidated).

## Moderator signals (shown as ⚑ chips; never auto-reject)
`contains-link`, `contains-phone`, `shouting`, `disposable-email`, `duplicate-text`, `email-matches-business-domain`, `email-matches-business-email` (possible self-review), `same-ip-as-another-review-of-this-business`, `review-burst` (≥3 in an hour), `held-after-reports`, `email-manually-verified`.

## Reporting
Anyone can report a published review (reason + details; "I represent this business" is self-declared and unverified until Phase 5). One report per IP hash per review, max 10/day. **3 distinct open reports auto-hold the review** (hidden, rating recalculated) until a moderator restores or rejects it.

## Moderation (Admin → Reviews)
Tabs: Pending · Reported · Held · Unverified · Published · Rejected. Publish / Hide / Reject (reason mandatory; emailed to reviewer) / Delete / manual email-verify (audit-logged override for when email can't be delivered). Every action is audit-logged.

## Reviewer control
Edit or hard-delete via the emailed link at any time. Editing a **live** review sends it back to PENDING (prevents bait-and-switch). Delete removes the review **and** the reviewer's email address.

## Business responses
Public reply shown under the review as "Response from {business}". Only allowed when the business is Claimed/Verified. Until owner accounts exist (Phase 5) an admin posts it on the owner's behalf. Businesses cannot edit or delete reviews.

## Ratings & SEO
`Business.ratingAvg/ratingCount` are denormalised from **PUBLISHED reviews only** and recalculated on every state change. `aggregateRating` + up to 10 `Review` objects appear in LocalBusiness JSON-LD only when they exist and are visible on the page. Reviews are collected by PrimeStreet, a third party, not by the business itself. Review/manage pages are `noindex` and disallowed in robots.txt.

## Personal data
Stored: display name, email, hashed IP. Email is never shown; it is deleted with the review. TODO before launch: privacy policy page + retention schedule (e.g. purge rejected reviews after 12 months).

## Email delivery
All emails go through `src/lib/mail.ts` and are recorded in `EmailOutbox` (Admin → Outbox). Set `RESEND_API_KEY` + `MAIL_FROM` to deliver via Resend (code path written but **untested against a live account**). Without a provider reviewers cannot confirm their email.
