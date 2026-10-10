# The business lifecycle programme

How PrimeStreet turns a listing nobody claimed into a paying customer, and keeps them. Every email below exists in `src/lib/email/business-templates.ts` with its trigger and commercial goal attached to it in code, so the programme and the implementation cannot drift apart.

## The two rules the whole thing rests on

1. **Money never buys trust.** No email may suggest that paying changes a rating, a review, search order or whether we write about you. It does not. What Premium sells is *room to show more of yourself* to demand you already have. Every email that pitches a product says this out loud, and a test fails the build if one stops saying it.
2. **Earned prompts only.** We ask for money off the back of something that actually happened — enquiries received, views, a busy category. No invented deadlines, no fake scarcity, no "3 slots left".

There is a commercial argument for both, not just an ethical one. A directory that sells rankings is worth nothing to readers, and a directory readers abandon is worth nothing to advertisers.

## The funnel

| Stage | Email | Trigger | What it is for |
|---|---|---|---|
| **Acquisition** | Your business is on PrimeStreet | Unclaimed 7+ days with real views | Turn a listing into an account. Top of the whole funnel. |
| | Claim reminder | 14 days later, still unclaimed | Recover the ones who meant to. **Then we stop.** |
| **Onboarding** | Finish your profile | 3 days after claim, under 70% | A complete profile converts far better later |
| | Your first review | First review published | Build the reply habit early |
| **Engagement** | Monthly performance report | First working day of the month | The habit email, and the evidence every later pitch leans on |
| | Review waiting for a reply | No reply after 7 days | Active owners buy; passive ones churn |
| | Quieter than usual | Views down 30%+ | Honest diagnosis. Explicitly refuses to blame it on not paying |
| **Conversion** | Premium, prompted by real demand | 5+ enquiries or 250+ views in a month | Main subscription conversion, earned by their own numbers |
| | Featured placement offer | Their category is busy and a slot is free | One-off revenue for businesses who will not subscribe |
| | Checkout not finished | PENDING order, 24h, unpaid | Recovers a nearly-made sale |
| **Post-purchase** | Premium bought, not set up | Premium 7 days, features unused | Highest-value retention email there is |
| | Featured campaign results | Campaign ends | Repeat purchase, earned by real numbers — including bad ones |
| **Retention** | Renewal reminder | 14 days before an annual renewal | A surprise charge costs more trust than the renewal is worth |
| | Card expiring | Card expires within 21 days | Prevents involuntary churn, the cheapest churn to avoid |
| | Final payment warning | 2 days before grace ends | Recovers payment and states the consequence plainly |
| | Premium has ended | Subscription ends | Leave honestly. An ugly exit guarantees they never return |
| **Win-back** | Still getting views | 30 days after ending, traffic continues | One email, their own numbers, no discount |
| **Relationship** | We wrote about you | An article names them | Costs nothing, worth more than any advert |
| | Podcast invitation | An editor picks a guest | Free content, and a relationship |
| **Security** | Someone tried to claim your business | Claim on an already-claimed profile | Nobody takes a listing quietly |
| | Someone was added | A second manager is linked | Nobody gains access silently |
| **Admin** | Receipt | Payment succeeds | A business that cannot get a receipt will not buy twice |
| | We have your enquiry | Advertising enquiry submitted | From the monitored inbox, so a sales lead never falls down a hole |

## Three kinds of email, and why the difference is legal

| Kind | Needs consent? | Unsubscribe? | Examples |
|---|---|---|---|
| **service** | No | No — turning it off would break the account | Sign-in links, claim decisions, customer enquiries, receipts, payment warnings |
| **lifecycle** | No, but stops on unsubscribe | Yes | Monthly report, review nudge, profile prompts |
| **marketing** | **Yes, explicit opt-in** | Yes | Premium offer, featured offer, win-back |

**Under PECR a sole trader or a partnership counts as an individual**, and most businesses in a local directory are exactly that. So marketing requires a recorded opt-in rather than leaning on a B2B exemption that often would not apply. `src/lib/email/consent.ts` is the single gate: it checks the kind, the opt-in, the unsubscribe flag and the frequency cap, and attaches the unsubscribe link.

**Frequency cap: one promotional email per fortnight**, however many rules fire at once. Lifecycle and service mail are unaffected.

Claim invitations are sent as **lifecycle**, not marketing: they are about the recipient's own listing, they offer no paid product, and they carry an unsubscribe link. The reminder says in the email that it is the last one — and it is.

## Where the money actually comes from

In rough order of how much each is worth:

1. **Premium subscriptions** — recurring, predictable, and the thing to optimise. The highest-leverage emails are not the pitch but *Premium bought, not set up* and *Card expiring*: keeping a customer is far cheaper than finding one.
2. **Featured placements** — one-off, suits businesses who will not commit monthly. Sell on real search volume in their category.
3. **Direct-sold advertising and sponsorship** — larger deals, handled by a person. Email's job is only to make sure the enquiry is acknowledged fast.
4. **Sponsored content** — highest value per unit, lowest volume, and the one with the most editorial risk. Always labelled, always names the sponsor.

The unlock for all four is **claimed profiles**. An unclaimed listing cannot buy anything, so the claim invitation is the most commercially important email in the programme even though it sells nothing.

## What we deliberately do not do

- No fake urgency or countdowns.
- No "your competitors are ahead of you" — we do not weaponise other businesses.
- No dark patterns on cancellation. *Premium has ended* tells them exactly what they keep.
- No buying or renting lists. Everyone in the programme is here because they are listed, claimed, or asked us.
- No selling reviews, rankings or coverage. Ever.

## Tests
- `scripts/test-consent.ts` — the gate: defaults, opt-in, cap, unsubscribe, resubscribe.
- `scripts/test-email-templates.ts` — branding, and the integrity rules above: every pitch carries the disclaimer, no email anywhere promises better rank or coverage for money, chasing emails promise to stop.
