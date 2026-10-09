# PrimeStreet

London's Businesses. Stories. People. — London business media + local discovery platform (primestreet.uk).

```bash
npm install
cp .env.example .env     # DATABASE_URL, NEXT_PUBLIC_SITE_URL
npm run db:reset         # create SQLite DB + seed SAMPLE data
npm run dev              # http://localhost:3000
npm run build && npm start
npm run icons            # regenerate PS favicon/PWA icons
npm run test:unit        # unit tests (needs seeded DB)
npm run build && npx next start -p 3417 &
npm run test:e2e         # browser tests (Edge via puppeteer-core)
npm run test:a11y        # axe + responsive overflow audit
```

Admin: /admin (sign in with ADMIN_EMAIL + ADMIN_PASSWORD; set them and SESSION_SECRET in .env). Import real businesses: Admin → Import (see docs/data-sourcing.md).

Editorial: Admin → Articles (see docs/editorial-guide.md). RSS at /feed.xml.

Reviews: see docs/reviews.md. Set RESEND_API_KEY + MAIL_FROM for email delivery (otherwise see Admin → Outbox).

Owners: /owner/login (passwordless). Claiming and verification: see docs/claiming.md.

SEO: see docs/seo.md (Admin → SEO for index health, overrides, redirects). `npm run test:seo` crawls and audits.

Podcast & video: see docs/podcast.md (Admin → Podcast & video; RSS at /podcast/feed.xml).

Search, discovery, saved lists and the newsletter: see docs/search.md. Run `npm run start:test` (mock-friendly) before `npm run test:e2e`.
Database, search engine, security and storage on Supabase: see docs/supabase.md.
Deployment (Vercel + Supabase): see docs/deploy.md.
Cities, areas and multi-city routing: see docs/cities.md.
Email senders and the no-reply policy: see docs/email.md.
Advertising, premium profiles, Stripe and sponsorships: see docs/commerce.md.

Docs: `phases.md` (roadmap), `projecttodolist.md`, `docs/decisions.md`, `docs/brand.md`, `docs/analytics.md`. Brand guide page: `/brand` (noindex).

**Important:** seed content is fictional and flagged `isSample`; it is noindexed and excluded from the sitemap. Replace with researched real data before launch.
