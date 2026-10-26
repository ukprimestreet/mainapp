# Decisions

The decisions only you can make, in one place. Settled ones are kept with their answer so nobody re-opens them.

**Written for:** the owner. Each open decision states the question, what it changes, the options, and my recommendation. Answer by editing this file or just telling me.

**Status: all 6 settled.** The blockers now are supply and the trade categories, not decisions.

---

## Settled

### D1 — Scheduler for fine-grained jobs ✅ 26 October 2026

**Answer: Supabase `pg_cron`** for anything Vercel cannot schedule.

Vercel's Hobby plan runs crons once a day, which cannot serve the brief's three-minute escalation threshold. Verified on our own instance: `pg_cron` 1.6.4 and `pg_net` 0.20.4 are available (not yet installed), Postgres 17.11, no `cron` schema yet.

Vercel keeps the existing daily job; Supabase takes the minute-granularity work. The immediate-escalation path — when matching finds nobody eligible, alert at once — ships first and needs no scheduler at all.

*Still needs from you:* enable `pg_cron` and `pg_net` in the Supabase dashboard (Database → Extensions). One click; our DB role is `postgres` but not superuser, so I can't guarantee doing it from code.

### D2 — Address lookup provider ✅ 26 October 2026

**Answer: Ideal Postcodes** (Royal Mail PAF). Key supplied, verified against their free test postcode, set in local `.env` and on Vercel production (not preview, so preview can't spend money).

It gives selectable individual addresses plus UDPRN/UPRN, which postcodes.io cannot. It does **not** give GSS codes, so postcodes.io still supplies the codes our geography keys on. Full detail in `docs/leadgen/ADDRESS_LOOKUP.md`.

*Still needs from you:* rotate the key (it passed through a chat transcript, and it isn't URL-restricted so anyone holding it can spend) · set a daily lookup cap in their dashboard · confirm the PAF caching terms before any cache is built.

---

### D3 — Individual admin accounts ✅ 26 October 2026

**Answer: the `AdminUser` model with role-based permissions.** No new vendor.

Built: individual accounts with scrypt passwords, two roles (`SUPER_ADMIN`, `ADMIN`), a capability map enforced on the server at every protected operation, durable login throttling in the database, opt-in TOTP two-factor with recovery codes, and an audit log that names the acting administrator on all 35 call sites.

The migration completes itself: the shared `ADMIN_PASSWORD` keeps working while no individual account can sign in, and stops the moment one can. Nobody has to remember to close the old door, and nobody can be locked out. `docs/admin-accounts.md` has the detail.

*Still needs from you:* run `npm run admin:ddl -- --schema=public` and create the first production account with `npm run admin:create`. Then remove `ADMIN_PASSWORD` once you have signed in with your own account.

### D4 — VAT on £1 lead credits ✅ 26 October 2026

**Answer: £1 per credit is the price EXCLUDING VAT. VAT is added at checkout when it legally applies.**

At the 20% standard rate, one credit is charged as:

| | |
|---|---|
Lead credit | £1.00 |
VAT at 20% | £0.20 |
**Charged** | **£1.20** |

So 100 credits costs £120 including VAT, at the standard rate.

**The condition that matters:** VAT may only be charged once PrimeStreet is VAT-registered and the supply is taxable. Adding VAT to a customer's bill before registration is not permitted. HMRC requires registration when taxable turnover passes **£90,000** over a rolling 12 months, or when it is expected to pass it within the next 30 days; voluntary registration below the threshold is also possible.

**What this means in code:**

- The base price stays **£1 per credit, excluding VAT**. `Product.pricePence` is already documented as ex-VAT, so nothing changes there.
- VAT is applied at checkout **at the applicable rate**, not baked into the price.
- VAT handling is **configurable** — registration status, VAT number and rate are settings, not constants, so the same build is correct before and after registration.
- **It defaults to off.** A misconfiguration must mean "no VAT charged", never "VAT charged while unregistered".
- Prices on screen say which they are: *"£1 per credit + VAT"* once registered, *"£1 per credit, no VAT charged"* before.
- Receipts show net, VAT and gross separately, with our VAT number once we have one.
- The rate and the threshold are checked against HMRC at implementation rather than hard-coded from this note — both have changed before.

### D5 — Where business registration lives ✅ 26 October 2026

**Answer: build a new registration flow.** This is the option I advised against; it is your call and it is recorded as yours, along with how the risk I raised gets handled.

**The risk I flagged, and how it is addressed.** The concern was two ways of becoming an owner, and a duplicated evidence model. The design therefore makes the new flow a **new front door onto the existing machinery**, not a second machine:

- **One primitive grants ownership.** Both the new flow and the existing claim converge on `grantOwnership()` in `src/lib/owner.ts`, which is the only code that creates an `Owner` and a `BusinessOwner` link. No second path to becoming an owner.
- **One evidence model.** The new flow reuses `claimEvidence()`: email verification is required to approve at all; a business-domain email **or** a phone call-back is required to reach `VERIFIED`. Registration cannot be a softer route to the same badge than claiming.
- **One admin queue.** Both routes produce rows the existing `/admin/moderation` queue already handles. No second approval screen to keep in step.
- **The five free credits hang off a verified account**, granted at the moment ownership is granted — not at form submission. Otherwise the grant is farmable by anyone with an email address.
- **If the business already exists in the directory, registration becomes a claim.** The flow detects it by name, website host and postcode using the existing `findDuplicate()` and routes the person into claiming rather than creating a duplicate listing. That is the specific failure the warning was about, and it is handled by detection rather than by hoping.

**What gets built:** a public registration flow that takes the business through its details, its location (postcode lookup, or the manual selector), its service categories and its service areas, then into the existing verification steps. Phase B onboarding.

### D6 — Pilot area ✅ 26 October 2026

**Answer: the whole of East London.**

**"East London" is not an administrative unit,** so it has to be defined rather than assumed. There is no ONS region, borough group or GSS code for it. Recorded definition, the seven boroughs normally meant by the term:

| Borough | GSS | Settlements | Wards | Already live on PrimeStreet |
|---|---|---|---|---|
Tower Hamlets | E09000030 | 33 | 20 | 4 |
Hackney | E09000012 | 35 | 21 | 4 |
Newham | E09000025 | 26 | 24 | 2 |
Waltham Forest | E09000031 | 23 | 22 | 2 |
Redbridge | E09000026 | 29 | 22 | 0 |
Barking and Dagenham | E09000002 | 15 | 19 | 0 |
Havering | E09000016 | 32 | 20 | 0 |
**Total** | | **193** | **148** | **12** |

**Deliberately excluded, and why.** Greenwich, Bexley and Lewisham appear in some "East London" groupings — the GLA London Plan's east sub-region reaches across the river — but they are south-east London and a reader in Bexley would not describe themselves as east London. Islington is usually inner north. Those four would add 108 settlements. If you want any of them, say so and it is one line.

### What this commits us to, honestly

The geography is **ready** — 193 settlements and 148 wards, all with GSS codes, already imported and tested. Configuring the market costs nothing.

**The supply is the entire problem.** Checked against the database rather than assumed:

- **Production holds 3 businesses and 0 owners.** Exactly one of them is in East London, and it is a bakery, not a trade.
- Development holds 11 businesses in East London, of which **3 are published and not sample data**, and some of those are my own test fixtures.
- **None of the 18 trades the lead system needs exists as a category yet**, so even a willing plumber in Romford cannot currently be listed.

Seven boroughs is roughly 2 million people. Two paying businesses per lead is impossible with fewer than two providers in a trade and an area, so a form opened across all of East London on day one would produce enquiries nobody can service — and the customer blames us, not the empty directory.

### So: East London is the market, and the form opens borough by borough

- **Scope: all seven boroughs.** That is what gets configured, what the geography covers, and what we recruit into.
- **The customer form opens per borough and per trade, only where providers exist.** A trade in a borough with fewer than two providers stays shut, and says so honestly rather than taking an enquiry it cannot route.
- **Recruit first, open second.** Barking and Dagenham remains the sensible first borough — there is a real cleaning business in the family to be provider one — but the market is East London from the start, so nothing has to be re-scoped later.

That honours the decision as made: the market is the whole of East London, and the switch for each part of it is provider supply rather than a smaller plan.

## Also waiting on you, but not decisions

| | Why it matters |
|---|---|
Enable `pg_cron` + `pg_net` in Supabase | Escalation on a timer cannot run without it |
Rotate the Ideal Postcodes key, set a daily cap | It isn't URL-restricted, so anyone holding it can spend |
Confirm PAF caching terms | A licence question, not a performance one |
Legal review: privacy notice, business terms, credit terms | Required before any live lead distribution |
SPF, DKIM, DMARC for primestreet.uk | Email deliverability |
Stripe keys and real prices in production | Credit purchase cannot go live without them |
Google Search Console verification | No first-party keyword or impression data until then |
An analytics provider | **Conversion rate cannot be measured at all today.** A lead platform that cannot measure conversion cannot be judged |
Recruit 3–5 pilot providers | Production has 3 businesses and 0 owners. Leads nobody services damage trust on the first enquiry |
Rotate credentials shared in chat earlier | Supabase keys, Resend key, admin password |
