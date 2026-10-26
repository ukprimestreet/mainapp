# Decisions

The decisions only you can make, in one place. Settled ones are kept with their answer so nobody re-opens them.

**Written for:** the owner. Each open decision states the question, what it changes, the options, and my recommendation. Answer by editing this file or just telling me.

**Status: 3 settled · 3 open.** D4, D5 and D6 remain. None blocks the current work.

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

## Open

### D3 — Individual admin accounts ✅ 26 October 2026

**Answer: the `AdminUser` model with role-based permissions.** No new vendor.

Built: individual accounts with scrypt passwords, two roles (`SUPER_ADMIN`, `ADMIN`), a capability map enforced on the server at every protected operation, durable login throttling in the database, opt-in TOTP two-factor with recovery codes, and an audit log that names the acting administrator on all 35 call sites.

The migration completes itself: the shared `ADMIN_PASSWORD` keeps working while no individual account can sign in, and stops the moment one can. Nobody has to remember to close the old door, and nobody can be locked out. `docs/admin-accounts.md` has the detail.

*Still needs from you:* run `npm run admin:ddl -- --schema=public` and create the first production account with `npm run admin:create`. Then remove `ADMIN_PASSWORD` once you have signed in with your own account.

### D4 — VAT on £1 lead credits

**The question:** is £1 per credit inclusive or exclusive of VAT?

**What it changes.** The displayed price, the checkout line, the invoice, and what a business can reclaim. Getting it wrong after you have sold credits means re-issuing invoices.

This is not a technical decision and I should not guess at it. It depends on your VAT registration status and when you expect to cross the threshold. **Your accountant, not me.**

| If | Then |
|---|---|
Not VAT registered | £1 is simply £1. Show "no VAT is charged" so a business is not left wondering |
VAT registered, £1 inclusive | 50 credits = £50, of which £8.33 is VAT. Simpler for the buyer |
VAT registered, £1 exclusive | 50 credits = £50 + £10 = £60. The displayed price must say "+ VAT" everywhere |

**What I will build meanwhile:** the ledger stores pence with a VAT field, and nothing on screen pre-judges the answer. The credit purchase flow cannot go live until this is settled — it is the one thing that would require re-issuing invoices to fix.

**Needed before:** Phase E (credits and payments) goes live. Does not block building it.

---

### D5 — Where business registration lives

**The question:** how does a business get a live listing and its five free credits?

**What it changes.** There is no self-service "register and go live" flow today. All three existing routes pass through admin review: editorial import, public submission (`/businesses/submit` → admin approval), and claiming an existing listing (`/claim` → evidence check → `grantOwnership()`).

| Option | Trade-off |
|---|---|
**Extend the existing claim/owner flow** *(recommended)* | An authenticated owner already exists there, and the credit grant can be tied to a verified account. No second source of truth |
Extend public submission | Lower friction, but a submission is not an authenticated account, so the five free credits become easy to farm |
Build a new registration flow | Cleanest on paper; duplicates the claim evidence model and risks two ways of becoming an owner |

**My recommendation: extend the claim/owner flow.** The five-credit grant has to hang off a verified account or it will be abused, and that verification already exists.

**Needed before:** Phase B onboarding is finished. I have a recommendation and will proceed on it unless you say otherwise.

---

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
