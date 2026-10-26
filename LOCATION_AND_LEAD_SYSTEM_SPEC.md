# Location and lead system — specification

**Version:** 0.1, Phase A proposal · **Date:** 26 October 2026 · **Status:** awaiting owner approval. Nothing in here is built.

**Written for:** the engineers implementing it and the product owner approving it. It assumes `EXISTING_PLATFORM_AUDIT.md` has been read.

---

## 1. What we are building, in one paragraph

A customer searches for a trade in their area, submits a job request, and the platform routes that request to **at most two paying local businesses** who then contact the customer directly. Businesses keep their free directory listing regardless; receiving an automatic paid lead costs **one credit (£1)**, with **five credits granted once** to each new eligible business. Administrators see every lead the moment it exists, are alerted when one cannot be placed, and can assign by hand. Listing and lead-buying stay strictly separate concepts.

---

## 2. Decisions the owner must make before Phase B

These five change the shape of the build. I am not guessing at them.

### D1. The 3-minute escalation needs a scheduler the current plan cannot provide

The platform is on Vercel **Hobby**, where crons run **once a day**. Options:

| Option | Cost | Granularity | Notes |
|---|---|---|---|
| **Vercel Pro** | ~£16/user/mo | Every minute | Simplest; keeps everything in one place and one mental model |
| **Supabase `pg_cron` + `pg_net`** | £0 | Every minute | We are already on Supabase. Calls our own endpoint on a schedule. Adds a second place where scheduling lives |
| **Upstash QStash** | Free tier, then usage | Per-message delay | Best *semantic* fit: when a lead is created, schedule one check 3 minutes later rather than sweeping every minute |
| Escalate inline | £0 | n/a | When matching finds nobody eligible, alert **immediately** — no timer needed |

**Recommendation: do the inline case first, and it covers most of the value.** If matching determines there is no eligible recipient, there is nothing to wait for — the prompt (§11) explicitly permits escalating immediately. A timer is only needed for the narrower case where assignment was *attempted* and delivery silently failed. For that, **QStash** is the better tool than a minute-by-minute sweep. Decision needed on which, and whether Pro is wanted anyway.

### D2. Address-level lookup: licensed data, real money

"The business selects its exact business address" (§3, Option A) requires Royal Mail PAF or OS AddressBase. No free source does it. Indicative routes: Ideal Postcodes, getAddress.io, or OS Data Hub — all priced per lookup or per month, all with licence terms to read. **Owner must choose a provider and a budget, or accept Option B (manual cascading selection) as the only path for now.** Manual selection alone fully satisfies the mandatory-location requirement; address lookup is a UX improvement, not a correctness one.

### D3. Individual admin accounts

Role-based restriction of customer contact details (§10) and per-admin audit attribution are impossible with one shared password. Options: add an `AdminUser` model with scrypt passwords (reusing `src/lib/author-password.ts`), or adopt Supabase Auth for staff. **Recommendation: an `AdminUser` model with a `role` field** — smaller, consistent with the three session patterns already in place, no new vendor.

### D4. VAT on £1 credits

£1 per credit must be stated as inclusive or exclusive of VAT before anything is sold, and the answer changes the displayed price and the invoice. The prompt says to confirm with an accountant (§8). **Owner action.** Until it is settled I will build the ledger in pence with a VAT field and display nothing that pre-judges the answer.

### D5. Where the registration flow lives

There is no self-service "register my business and go live" flow today — every route passes through admin review (audit §2). Three choices: extend public submission, extend claiming, or build a new owner-facing registration. **Recommendation: extend the existing claim/owner flow** and add onboarding steps there, because that is where an authenticated owner already exists and where the credit grant can be tied to a verified account. Creating a brand-new registration path would duplicate the claim evidence model and risk two sources of truth.

---

## 3. Geography — the model

### Principle

**One dataset, six consumers.** Business registration, business service areas, customer job-request location, lead matching, admin filtering and directory/SEO pages all read the same tables. No feature gets its own list.

### Proposed shape

Rather than widen `Location` in place, introduce a **country-first place tree** and keep `City` as the editorial concept it actually is (a market we publish in), not the root of all geography.

```
Place
  id            cuid
  name          canonical name            e.g. "Dagenham Dock"
  slug          unique within parent      e.g. "dagenham-dock"
  kind          COUNTRY | REGION | COUNTY | LOCAL_AUTHORITY | TOWN | CITY
                | BOROUGH | DISTRICT | VILLAGE | SUBURB | NEIGHBOURHOOD | ESTATE | LOCALITY
  parentId      → Place (nullable at COUNTRY)
  gssCode       ONS code where one exists  e.g. "E09000002"
  osId          OS Open Names id where used
  lat / lng     from the source, not invented
  aliases       PlaceAlias[]              alternative names and spellings
  source        POSTCODES_IO | OS_OPEN_NAMES | ONS | MANUAL
  sourceDate    when the record was taken from that source
  confidence    HIGH | MEDIUM | LOW
  active        Boolean
  serviceable   Boolean                   can work genuinely be delivered here
```

- **Flexible depth.** The number of levels differs by nation and by place: a London address needs no county, a Berkshire one needs a unitary authority. The tree permits that; a fixed column-per-level design does not.
- **GSS codes are the canonical identifiers** the prompt asks for, and postcodes.io gives them free.
- **Aliases in their own table**, with a unique constraint, so "Saint Albans"/"St Albans" resolve to one place and cannot become two records.
- **`serviceable`** answers "should this place ever get a page or a lead?" separately from "does this place exist?".

**A place may belong to more than one functional area** (prompt §6 warns against forcing a single parent). The tree holds the *administrative* parent; additional relationships go in a `PlaceLink` edge table (`fromId`, `toId`, `relation`) so "Rush Green is commonly associated with Romford as well as Dagenham" is expressible without corrupting the hierarchy.

### Migration of the 83 existing locations

Non-negotiable: **live URLs must not break.** `/locations/hackney`, `/businesses/london/cleaning/...` and the city-scoped routes are indexed. Plan:

1. Create `Place` and backfill England → London → the 33 boroughs → the 50 neighbourhoods, carrying each existing `Location.id` into `Place.legacyLocationId`.
2. Add `Business.placeId` **alongside** `locationId`, populated from the mapping. Do not drop `locationId` in the same batch.
3. Point reads at `placeId` once backfill is verified for 100% of rows.
4. Only then consider retiring `Location`, in a separate, separately approved batch, with redirects verified.

### Postcode resolution, honestly scoped

`resolvePostcode(postcode)` returns a **suggestion for the business to confirm**, never a silent assignment:

1. Call postcodes.io (already integrated, free, OGL). Take `country`, `region`, `admin_district`, `admin_ward`, `parish`, GSS codes, lat/lng.
2. Match the upper levels to `Place` rows by `gssCode` — exact, no name matching.
3. For the locality, find candidate `Place` rows of locality-ish kinds near the coordinates, ranked by distance.
4. **Show the business the resolved chain and the locality candidates, and make them confirm.** If nothing credible is found, fall back to manual selection — never invent a locality.

Store `address`, `postcode` and the resolved `placeId` chain **separately**, as §3 requires.

### Service coverage

Replace free-text `areasServed` with:

```
BusinessServiceArea
  businessId  → Business
  placeId     → Place
  mode        EXACT | INCLUDES_CHILDREN     "this place" vs "this borough and everything in it"
  @@id([businessId, placeId])
```

`mode = INCLUDES_CHILDREN` on a borough is how "I serve the whole of Barking and Dagenham" is expressed once rather than fifteen times — and it is **visible to the business and the admin**, as §3 requires. Matching only ever considers places a business has selected, directly or through `INCLUDES_CHILDREN`.

### Categories

```
BusinessCategory   businessId, categoryId, isPrimary   @@id([businessId, categoryId])
CategoryAlias      categoryId, alias (unique)          "painter" → painting-and-decorating
```

`Business.categoryId` stays as the primary for one batch to avoid breaking directory URLs, then becomes a derived view of `isPrimary`.

---

## 4. Leads — the model

The existing `Lead` is a direct message to one Premium business. **Keep it, untouched.** The new concept is a different thing and gets its own tables; conflating them would break a working feature and muddle two lifecycles.

```
JobRequest                          the customer's enquiry — one row per request
  id, reference        human-usable, e.g. PS-7F3K2
  name, email, phone
  categoryId  → Category            resolved from the customer's words via CategoryAlias
  placeId     → Place               resolved; the customer never sees the hierarchy
  postcode                          optional, never a full address
  description, urgency?, preferredContactTime?
  consentVersion, consentAt         which privacy notice they agreed to
  ipHash, idempotencyKey (unique)
  status      NEW | MATCHING | PARTIALLY_ASSIGNED | ASSIGNED | UNASSIGNED
              | ESCALATED | CLOSED | REJECTED
  createdAt

LeadAssignment                      one row per recipient — never a list in a text field
  id, jobRequestId → JobRequest, businessId → Business
  type        PAID | SPONSORED                   sponsored = admin gift, no credit
  state       RESERVED | ASSIGNED | DELIVERED | ACCEPTED | FAILED | CANCELLED
  creditTxId  → CreditTransaction?               null for SPONSORED
  assignedBy  ADMIN id or "system"
  reservedAt, assignedAt, deliveredAt, failedAt
  failureReason?
  @@unique([jobRequestId, businessId])           a business cannot receive the same lead twice

MatchDecision                       why each business was in or out — the audit the prompt demands
  jobRequestId, businessId, stage (1–4), included Boolean, reason, createdAt

LeadNotification
  assignmentId, channel EMAIL | IN_APP | SMS, state QUEUED | SENT | FAILED,
  providerId?, attempts, lastError?, createdAt
```

### Enforcing "no more than two paying businesses" at the database level

Application logic alone loses this race. The prompt requires both levels (§9). Postgres gives us a clean answer:

```sql
-- A partial unique index over a per-lead sequence number, so only slots 1 and 2 can exist.
ALTER TABLE "LeadAssignment" ADD COLUMN "paidSlot" smallint;
ALTER TABLE "LeadAssignment" ADD CONSTRAINT paid_slot_range
  CHECK ("paidSlot" IS NULL OR "paidSlot" IN (1, 2));
CREATE UNIQUE INDEX paid_slot_unique
  ON "LeadAssignment" ("jobRequestId", "paidSlot")
  WHERE "paidSlot" IS NOT NULL AND state <> 'CANCELLED';
```

A third concurrent paid assignment has no slot available and the insert fails. `SPONSORED` assignments carry `paidSlot = NULL` and are therefore unconstrained — which is correct, and is also exactly the loophole §9 warns about, so sponsored assignments are admin-only, reason-required and logged.

---

## 5. Matching engine

`matchJobRequest(jobRequestId)` — a single, idempotent, re-runnable function. Running it twice must never double-charge; `LeadAssignment` uniqueness and the credit ledger guarantee that.

**Stages, stopping as soon as enough eligible recipients are found:**

| Stage | Scope |
|---|---|
| 1 | Businesses whose coverage includes the **exact place** |
| 2 | Coverage includes the **parent** place (town/borough), via `INCLUDES_CHILDREN` or explicit selection |
| 3 | Coverage includes the **wider administrative area** |
| 4 | **Nearby places** by coordinate distance — only where the business opted in, under an explicit configured distance policy |

**Eligibility at every stage** — and each exclusion is written to `MatchDecision` with its reason:

- Category matches (via `BusinessCategory`, including `CategoryAlias` resolution)
- `published`, not `isSample`, not suspended
- Coverage genuinely includes the place
- For a `PAID` assignment: credit balance ≥ 1
- Not already assigned this lead
- Fewer than 2 paid slots taken

**Allocation when several are equally eligible:** round-robin on "least recently assigned", configurable — not always the same business. Exact-locality matches are preferred over wider ones.

**Never** mark a lead assigned when the assignment failed. **Never** treat two places as matching because their names are similar or they share a county.

---

## 6. Credits

```
CreditAccount       businessId (unique), balance Int, freeGrantAt DateTime?, lowWarnedAt?, zeroWarnedAt?
CreditTransaction   id, businessId, delta Int (+/-), kind, balanceAfter Int,
                    reason, assignmentId?, orderId?, adminId?, createdAt
                    kind: FREE_GRANT | PURCHASE | CONSUMPTION | REFUND | ADJUSTMENT | REVERSAL
```

**A ledger, not a mutable number.** `balance` is a cached sum; every movement has a row with a reason, a source and the resulting balance, so any figure can be recomputed and any dispute answered.

- **Five free credits, once.** `freeGrantAt` non-null is the guard; granting is `INSERT … ON CONFLICT DO NOTHING` on a unique account row, so re-registering or re-editing a profile cannot repeat it.
- **Consumption point:** reserve on assignment creation, confirm on delivery, reverse if delivery fails. One credit per lead per business. Retries and reprocessing never charge twice — the `(jobRequestId, businessId)` unique constraint is what makes that true rather than hoped for.
- **Atomicity:** balance changes happen inside a `db.$transaction` with the assignment insert, using a conditional update (`WHERE balance >= 1`) so two concurrent assignments cannot both spend the last credit.
- **No automatic refund** because a customer did not answer the phone, unless a published guarantee says so.
- **Zero credits:** listing stays live, automatic paid assignment stops, dashboard says so plainly, one email — not one per failed attempt.

**Purchase** reuses the existing pipeline exactly: a `Product` row with `kind = "CREDITS"`, `createCheckout()`, Stripe, signed webhook, `StripeEvent` idempotency, and one new branch in `processEvent()` that writes a `PURCHASE` transaction. Quantity × £1, shown as a plain calculation. Credits are added **only** on verified webhook confirmation — never on the browser returning from Stripe.

---

## 7. Admin, notifications and privacy

- **`/admin/leads`** — every lead the moment it exists, assigned or not. Filters per §10. Detail view shows the resolved place chain, every `MatchDecision` with its reason, assignments, notification outcomes, credit movements and the full audit trail.
- **Escalation** — immediate when matching finds nobody eligible; otherwise one delayed check (D1). De-duplicated so retries do not re-alert. The lead stays visible in the dashboard even when the alert email fails.
- **Manual assignment** — suggested businesses ranked by relevance, free search, visible coverage and credit balance, explicit `PAID` vs `SPONSORED` choice, reason recorded, two-paid-slot limit still enforced.
- **Business notification** — `service`-class email (not marketing, so no consent gate but also no unsubscribe exemption abuse), through the existing `enquiries` sender with the customer as `Reply-To` where sharing is permitted. Genuine urgency only: no invented expiry, no "sent to only one business" unless true.
- **Low/zero credit** — thresholds configurable (default 2), `lowWarnedAt`/`zeroWarnedAt` prevent repeats.

### Privacy — the part that needs a lawyer, not an engineer

Sharing a customer's name, email and phone with up to two businesses is a **new processing purpose** that the current privacy notice does not cover. Before any live distribution:

- The enquiry form must state who receives the details, how many businesses, why, for how long, and how to exercise data rights.
- Marketing consent must be **separate and unticked**, never bundled into the service enquiry.
- Only the actual recipients of that lead get the contact details — never the whole directory.
- Retention and deletion rules, role-based access, and an audit trail of consent.
- **The notice, the business terms and the £1 credit terms need review by a qualified UK adviser** (prompt §17). I will draft them; I am not a substitute for that review, and I will not claim compliance.

---

## 8. Recommended pilot — and why it is not what you might expect

Production holds **3 businesses and 0 owners**. A lead system with no providers produces leads nobody can service, which burns the customer's goodwill and the platform's reputation on the very first enquiry.

**So the pilot's first job is supply, not demand.** Recommended order:

1. **One service, one borough.** Cleaning in Barking and Dagenham is the obvious candidate: the `Cleaning` category exists, the boroughs exist, and there is a real business in the family that can be a first provider.
2. **Recruit a minimum of 3–5 genuine providers in that pairing before a single customer-facing form goes live.** Two paying recipients per lead is impossible with fewer than two providers.
3. Only then open the job-request form, to that one service and borough.
4. Measure: are leads serviceable, are providers contacting customers, would they pay again.
5. Expand by borough, not by bulk page generation.

**I would not pick a pilot on keyword demand alone.** Demand is useless without supply, and the prompt agrees (§20: "Do not assume that a particular service is the best pilot without evaluating provider availability").

### D6 — the master plan suggests a different area, and this needs your decision

`docs/UK_Local_Services_Lead_Generation_SEO_Master_Plan.docx` §12 suggests piloting removals, cleaning or gardening in **a cluster around Thatcham, Newbury, Wash Common, Speen and Donnington** — West Berkshire. My recommendation above is **cleaning in Barking and Dagenham**. Both follow the same rule the master plan sets — "the best pilot category should be chosen after checking which providers can buy and fulfil leads" — and reach different answers from different starting facts:

| | West Berkshire (master plan) | Barking and Dagenham (this spec) |
|---|---|---|
| Geography already in the database | **None.** PrimeStreet holds one city, London | Borough and neighbourhoods already exist |
| Known provider supply | **None identified** | One real cleaning business in the family, plus a local market |
| Platform work needed first | A new `City`, a new region, a fresh locality import, new directory URLs | Extend what is already live |
| Fit with the existing brand | PrimeStreet is a **London** publication; a Newbury section is a positioning decision, not just a data one | Native |

**Recommendation: Barking and Dagenham for the pilot, West Berkshire as the second market.** It tests the whole commercial loop against geography and supply that already exist, which is what a pilot is for. Standing up a new region *and* a new lead system at once means that if the pilot fails you cannot tell which half failed.

If the Newbury cluster matters commercially for a reason outside this repository, say so and I will plan it as the pilot instead — it is a larger Phase B, not an impossible one.

---

## 9. What I am deliberately not doing in this spec

- Not writing code. Phase A is audit and architecture.
- Not creating landing pages. The three-page batch limit is noted and respected; none are authorised and none exist.
- Not importing geography data yet — licensing and the migration plan come first.
- Not claiming any part of this is compliant, costed or final without the five decisions in §2.
