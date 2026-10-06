# Analytics foundation (Phase 1: plan only)

No tracker is installed yet (privacy/cookie consent decision pending). Recommended: Plausible or GA4 loaded via a consent-aware component in `layout.tsx`, gated on `NEXT_PUBLIC_GA_ID`.

Events to add (names fixed now so data is consistent later): `business_view`, `directory_search` (q, category, area, results), `claim_start`, `claim_submit`, `review_submit` (Phase 4), `article_read`, `podcast_play`, `outbound_click` (website/phone).
Also: verify the site in Google Search Console and submit `/sitemap.xml` once real (non-sample) content is live. Blocker: needs the owner's Google account/domain access.
