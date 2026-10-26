# Address and postcode lookup — Ideal Postcodes

**Decision D2, settled 26 October 2026.** Provider: [Ideal Postcodes](https://ideal-postcodes.co.uk), serving Royal Mail PAF.

Everything below was verified against the live API using their **free test postcode `ID1 1QD`**, which returns the full schema without consuming a paid lookup. No assumptions.

---

## Why a paid provider at all

postcodes.io (free, already integrated) gives country, region, local authority, ward and **ONS GSS codes** from a postcode. What it cannot do is list the individual addresses at that postcode. "The business enters its postcode and selects its exact address" — the registration experience the brief asks for — needs PAF or AddressBase, both licensed and chargeable. That is the whole reason for this spend.

## What the key gives us — verified

Key status: `available: true`, context `GBR`. A lookup of `ID1 1QD` returned **7 addresses**, each with:

| Field group | Fields |
|---|---|
Address | `line_1`, `line_2`, `line_3`, `building_name`, `building_number`, `sub_building_name`, `premise`, `thoroughfare`, `dependant_thoroughfare`, `dependant_locality`, `double_dependant_locality`, `organisation_name`, `department_name`, `po_box` |
Postal | `postcode`, `postcode_outward`, `postcode_inward`, `post_town`, `postcode_type`, `delivery_point_suffix` |
Administrative | `district`, `ward`, `county`, `administrative_county`, `postal_county`, `traditional_county`, `country` |
Identifiers | `udprn`, `uprn`, `umprn`, `id` (`paf_25962203`) |
Geo | `latitude`, `longitude`, `eastings`, `northings` |

## The gap that shapes the design: no GSS codes

`district` and `ward` arrive as **names**. `county_code` is empty and there is no code field for either. Our `Place` tree deliberately keys on GSS codes, because [one in five place names is ambiguous](GEOGRAPHY_SCHEMA.md#4a-ambiguous-place-names--the-measured-problem-and-the-plan).

So the two providers do different jobs, and neither is asked to do the other's:

| Need | Provider | Cost |
|---|---|---|
The list of addresses at a postcode, and the one the user picks | **Ideal Postcodes** | chargeable |
The GSS codes that identify the place in our tree | **postcodes.io** | free |

Both are called once per postcode entry. The free call is what connects the result to `Place`; the paid call is what lets someone pick their building.

### The name-matching fallback, measured

If postcodes.io is unavailable, `district` → local authority can be matched by name. That was checked rather than hoped:

- All **296** local authority names in our tree are **distinct** — no duplicates.
- Ideal Postcodes returned `district: "Hammersmith and Fulham"`, which matches our `E09000013` exactly.
- **4 of 296** carry ONS forms that PAF is unlikely to reproduce verbatim and need a hand-verified alias: `Bristol, City of` (E06000023), `Herefordshire, County of` (E06000019), `Kingston upon Hull, City of` (E06000010), `Bournemouth, Christchurch and Poole` (E06000058).

**Ward names are not globally unique** — 6,428 distinct across 6,834 wards — so a ward is only ever resolved *within* an already-identified local authority, never on its own.

## Security — this key spends money

Our server-side call carried no `Referer` or `Origin` and was accepted, which means the key is **not URL-restricted**. Anyone holding it can spend against the account. Therefore:

- **Server-side only.** Never `NEXT_PUBLIC_`, never in client JavaScript, never in a page's HTML. Address autocomplete goes through our own route handler so the key stays on the server.
- **Set a daily lookup limit in the Ideal Postcodes dashboard.** That is the practical spend cap. IP allowlisting is awkward because Vercel's egress addresses are not static without an add-on.
- **Rotate this key.** It was shared in a chat transcript. The one in use should be a fresh one that has not been.
- Stored as `IDEAL_POSTCODES_KEY` in the environment. Set in local `.env` and **on Vercel production** (26 October 2026, after a fresh login to `ukprimestreet-6381`). Deliberately **not** set on preview: preview lookups would spend real money.

## Caching — a licensing question, not an engineering one

The obvious optimisation is to cache postcode → address results so a repeat lookup is free. **PAF is licensed data and that caching is restricted.** Storing an address a user has actually selected, as part of your own record of that customer or business, is normally permitted; building a general cache of postcode-to-address lists to avoid paying for future lookups generally is not.

**This must be confirmed against the Ideal Postcodes terms before any cache is built.** Until it is, the design assumes:

- Store the address the user **selected**, against their business record. That is our record of them.
- Store `udprn`/`uprn` as the stable identifier for that address.
- Do **not** retain the other addresses returned by a lookup.
- Do not pre-fetch or bulk-download.

Getting this wrong is a licence breach, not a performance problem, so it is flagged rather than designed around.

## Cost control in the design

- One paid lookup per postcode the user actually enters, triggered on submit or on an explicit "find my address" action — **not on every keystroke**. Autocomplete-per-character is how these bills become surprising.
- Debounce and a minimum length before any call.
- Validate the postcode shape locally first (`normalisePostcode()` already exists in `src/lib/geo.ts`); never spend a lookup on something that is not a postcode.
- Rate limit per IP and per session, reusing the controls already on the enquiry form.
- Count lookups in our own records so the bill is predictable and attributable, not discovered at the end of the month.
- `ID1 1QD` and the other test postcodes are free: every test and e2e suite uses those, never a real one.

## Implementation plan — batch B3, not yet built

1. `src/lib/address.ts` — a thin server-side client: `lookupPostcode(postcode)` returning addresses, `resolveAddress(udprn)` for a chosen one. Timeouts, retries, and a clear error when the key is missing rather than a silent empty list.
2. `/api/address/lookup` — a route handler so the key never reaches the browser; rate limited; postcode shape validated before any spend.
3. `resolvePostcode()` — combines the paid address list with the free GSS hierarchy, matches to `Place` by **code**, and returns a **suggestion the user confirms**. Never a silent assignment.
4. Fallback to the cascading manual selector whenever the lookup fails, the key is absent, or nothing credible is found.
5. Tests against the free test postcodes, plus the 4 awkward local-authority names as a fixture.
