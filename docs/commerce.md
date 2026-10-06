# Commerce & monetisation (Phase 9)

## Principles
Money never buys trust: no effect on ratings, reviews, organic order or "Similar businesses". Every paid placement is labelled ("Sponsored", "Advertisement", "Sponsored by …"); founder-owned businesses carry an automatic disclosure.

## Revenue lines
| Line | Where | Notes |
|---|---|---|
| Premium profile | `/owner/business/:id/promote` | gallery, offer, lead form, click analytics |
| Featured placement | category / area / area×category / search | max 2 per slot, fair rotation |
| Display ads | home, under articles, podcast episodes | first-party only |
| Sponsorships | podcast episodes, newsletter | admin ledger |
| Leads | profile enquiry form | emailed to the owner |

## Admin (`/admin/commerce`)
Products (price, Stripe Price id, active), Premium plans (manual grants need a note), Campaigns, Sponsorships, Enquiries.

## Stripe
Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (optional `STRIPE_API_BASE` for tests). Register `/api/stripe/webhook` for: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.updated/deleted, checkout.session.expired, charge.refunded. Products without a Stripe Price id use "Request this" (sales enquiry).

## Tracking
`/go/campaign/:id`, `/go/biz/:id/:kind` (302 from DB data) and `POST /api/track/click` (phone). Bots ignored; `/go/` is disallowed in robots.txt.

## Before going live
Live Stripe keys and Prices, VAT/invoicing, legal review of advertising terms.

## Tests
`scripts/test-commerce.ts`, `scripts/e2e-commerce.mjs` (mock Stripe on :3998; use `npm run start:test`).
