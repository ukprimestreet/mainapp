# Decisions

The decisions only you can make, in one place. Settled ones are kept with their answer so nobody re-opens them.

**Written for:** the owner. Each open decision states the question, what it changes, the options, and my recommendation. Answer by editing this file or just telling me.

**Status: 5 settled · 1 open.** Only D6, the pilot area, remains.

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

## Open

### D6 — Pilot area

**The question:** which service and area do we prove the whole loop on first?

**What it changes.** Which geography gets exercised, and where providers get recruited. **Correction to something I said earlier:** I claimed this blocked batch B3. It does not — the resolver and the schema are area-agnostic, and I will test against both candidates. It blocks the *pilot*, not the code.

| | West Berkshire (master plan §12) | Barking and Dagenham (my recommendation) |
|---|---|---|
Geography in the database | Now imported — Thatcham, Newbury, Wash Common, Speen and Donnington all verified present | Imported, and already live on the site |
Known provider supply | None identified | One real cleaning business in the family, plus a local market |
Platform work first | A new `City`, new directory URLs, a positioning decision about a London publication covering Newbury | Extends what is already live |
Brand fit | PrimeStreet is a **London** title today | Native |

**My recommendation: Barking and Dagenham first, West Berkshire as market two.** A pilot that stands up a new region *and* a new lead system at the same time cannot tell you which half failed. If the Newbury cluster matters commercially for a reason outside this repository, say so and I will plan it as the pilot instead — it is a larger Phase B, not an impossible one.

**Needed before:** recruiting providers, and the first landing page.

---

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
