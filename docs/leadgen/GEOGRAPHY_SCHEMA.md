# Geography schema

**Version:** 0.1 · **Date:** 26 October 2026 · **Status:** design. Nothing below is built.

How the platform represents places, where the data comes from, what licence it arrives under, and how a record is verified before it can carry a page or receive a lead.

---

## 1. The problem with what we have

The live model is **city-first**, which is correct for a London publication and wrong for England:

```
City (1 row: london)
 └── Location (83: BOROUGH 33 | NEIGHBOURHOOD 50)
      └── parentId → Location
```

`Location.slug` is unique *within a city*. There are two place types. A business in Newbury has nowhere to live, and "Berkshire" and "West Berkshire" are not expressible at all.

## 2. Entity design

### `Place`

| Field | Purpose |
|---|---|
`id` | stable internal id
`name` | canonical name — "Dagenham Dock"
`slug` | unique within parent
`kind` | `COUNTRY · REGION · COUNTY · LOCAL_AUTHORITY · CITY · TOWN · BOROUGH · DISTRICT · VILLAGE · SUBURB · NEIGHBOURHOOD · ESTATE · LOCALITY`
`parentId` | administrative parent, null at `COUNTRY`
`gssCode` | ONS code where one exists — `E09000002`
`osId` | OS Open Names identifier where used
`lat` / `lng` | from the source, never estimated
`source` | `ONS · OS_OPEN_NAMES · POSTCODES_IO · LOCAL_AUTHORITY · PRIMESTREET_EXISTING · MANUAL`
`sourceDate` | when it was taken from that source
`confidence` | `HIGH · MEDIUM · LOW`
`evidenceNotes` | free text — why we believe this record
`serviceable` | can work genuinely be delivered here
`pageJustified` | `YES · NO · UNREVIEWED` — and the reason, in `decisionNotes`
`active` | soft delete
`legacyLocationId` | the `Location` row this replaces, for migration

### `PlaceAlias`

`placeId`, `alias`, `kind` (`SPELLING · FORMER_NAME · COLLOQUIAL · ABBREVIATION`), unique on `(alias, parentScope)`.

Aliases exist so "St Albans" / "Saint Albans" and "Becontree Heath" / "Beacontree Heath" resolve to **one** record. The master plan is explicit: do not create multiple pages because a locality has several spellings.

### `PlaceLink`

`fromId`, `toId`, `relation` (`ALSO_ASSOCIATED_WITH · ADJACENT_TO · POSTAL_TOWN_OF`).

Because **places do not form a clean tree.** Rush Green is administratively in Barking and Dagenham but is commonly associated with Romford, which is in Havering. A single-parent hierarchy forces a false choice; this edge table records the association without corrupting the hierarchy. The master plan calls for exactly this ("support many-to-many relationships and aliases").

### Attaching businesses

```
Business.placeId          → Place          operating location
BusinessServiceArea       businessId, placeId, mode: EXACT | INCLUDES_CHILDREN
```

`INCLUDES_CHILDREN` on a borough expresses "I serve all of Barking and Dagenham" once rather than fifteen times, and the resolved scope is shown to the business and the administrator so nobody is guessing what they agreed to.

## 3. Sources and licences

| Source | Gives us | Licence | Cost | Status |
|---|---|---|---|---|
| **postcodes.io** | country, region, local authority, ward, parish, GSS codes, lat/lng | OGL (derived from ONS/OS open data) | Free | **Already integrated** (`src/lib/geo.ts`), currently used only for lat/lng |
| **ONS geography** | administrative hierarchy and GSS codes, authoritative | OGL v3, attribution required | Free | Not imported |
| **OS Open Names** | place names incl. villages, suburbs, localities, with coordinates | OGL, attribution required | Free | Not imported — the key missing piece |
| Local authority data | neighbourhood and estate names | Varies per authority | Free, usually | Case by case |
| **Royal Mail PAF / OS AddressBase** | selectable individual addresses | Commercial licence | **Paid** | **Not licensed. Decision D2** |

Attribution obligation: OGL requires an acknowledgement. A line in the site footer or a `/data-sources` page covers it and should ship with the first imported row, not later.

### What postcode lookup can and cannot do — verified, not assumed

Live call, `RM10 7AA`, 26 October 2026:

```
country        England
region         London
admin_district Barking and Dagenham   E09000002
admin_ward     Eastbrook & Rush Green E05014059
parish         Barking and Dagenham, unparished area
```

**It returns a ward. It does not return "Dagenham" (a town) or "Dagenham Dock" (a locality).** Wards are electoral units and do not align with the local place names this project is built on.

Therefore `resolvePostcode()` is designed as a **suggestion the user confirms**:

1. postcodes.io → upper hierarchy, matched to `Place` by `gssCode` only. Never by name.
2. Locality: candidate `Place` rows of locality-ish kinds, ranked by distance from the postcode centroid.
3. Show the chain and the candidates. **The business confirms.** If nothing credible is near, fall back to manual cascading selection.

Never silently infer a locality. The master plan says it twice: "Do not equate postcode areas with neighbourhoods", "Do not infer a locality from postcode text alone."

## 4. Validation rules

A `Place` row may not be created unless:

1. It carries a `source` and a `sourceDate`.
2. Either a `gssCode` (administrative levels) or an `osId` (place-name levels), or `confidence = LOW` with `evidenceNotes` explaining why it is being kept anyway.
3. Duplicate check passed: normalised name + parent, and the alias table, both clear.
4. `serviceable` is set deliberately, not defaulted.

A `Place` may not carry a landing page unless `pageJustified = YES` **and** a provider actually covers it. A location existing is not a reason for a page — a serviceable location with something useful to say is.

### Duplicate detection

Normalise: lowercase, strip punctuation and `the`, collapse whitespace, fold accents. Compare within the same parent **and** across the alias table. Places legitimately sharing a name (there are several Richmonds) are distinguished by parent and GSS code, never merged.

## 4a. Ambiguous place names — the measured problem and the plan

An earlier note said "one in five English place names is ambiguous". **That figure was wrong**, and wrong in a way that would have led to the wrong design. It counted any name appearing on more than one row, which lumps together four different situations — three of which need *merging*, not disambiguating.

Measured with `scripts/analyse-place-ambiguity.mjs` against the 50,257 settlement rows (`LOC`, `BUA`, `BUASD`), of 39,637 distinct settlement names:

| Situation | Names | What it actually is | Treatment |
|---|---|---|---|
| Name used once | 34,470 | unambiguous | nothing to do |
| Same authority, same type | 190 | one place recorded twice, or split across a boundary | **merge** |
| Same authority, different type | 1,521 | one place recorded at two levels — Becontree is both a locality and a ward | **collapse** to the finest level |
| Different authorities | 3,456 | genuinely different places sharing a name | **disambiguate** |

So the real ambiguity rate is **8.7% of settlement names, not 20%** — and the inflated figure came from counting ward, parish and county rows that are hierarchy levels rather than places.

### Geometry does most of the merging

Clustering same-name rows by distance (single-link, 5 km) was tested against the data:

- 5,167 names appear on more than one row → **12,800 distinct places**
- **1,908 of those names collapse entirely to one place.** They were never ambiguous: they are built-up areas straddling a boundary. Accrington appears under both Hyndburn and Rossendale with an identical population of 35,456 — one town, two authorities. Aldershot appears under Guildford, Rushmoor and Waverley.
- **3,259 names remain genuinely ambiguous.**

Radius sensitivity is low — 3 km gives 3,327 and 10 km gives 3,182 — so the result does not hinge on picking the number precisely. 5 km is the default, recorded rather than tuned.

Without this step we would create thousands of duplicate `Place` rows, which is exactly what the master plan forbids: *"Do not create multiple records for the same locality."*

### What disambiguates the genuine residue

| | Names | Share |
|---|---|---|
"Name, Local Authority" is unique | 2,817 | **86%** |
Needs something finer — two distinct places in one authority | 442 | 1.1% of all settlement names |

Region alone disambiguates **nothing** (0 cases) — it is too coarse, and the collisions are mostly within a region.

The 442 hardest cases are two Aishes in South Hams, two Allingtons in Wiltshire, five Ashtons across Cornwall, Peterborough, Sedgemoor and Winchester. Almost all are tiny hamlets with no recorded population.

### The plan

1. **Nothing resolves by name.** Every reference — business location, service area, job request, matching, URL — keys on `place_id` and GSS codes. A name is a label for humans, never an identifier. This single rule removes the whole class of failure where a Havering lead reaches a Hertfordshire business.

2. **Merge before disambiguating.** Import in this order: collapse same-authority level duplicates to the finest level, keeping the others as `PlaceLink` rows; then cluster remaining same-name rows within 5 km into one `Place` with multiple source rows recorded. Only what survives both steps is treated as a distinct place.

3. **A computed disambiguation label**, not a hand-written one: the *shortest parent that makes the name unique*. "Becontree" where it is unique; "Rush Green, Havering" where it is not; "Allington, near Grantham" for the 442 that need a nearer landmark than the authority. Computed at import, stored, and shown in every selector.

4. **Postcode first for customers, which makes this almost moot.** A postcode resolves to exactly one ward and one authority, so the lead flow asks for a postcode — which routing needs anyway — and name entry is only a convenience path. Ambiguity then affects a fallback, not the critical path.

5. **Refuse to guess.** Where a typed name matches more than one place and no default is defensible, the interface asks. Population picks a default only where one place is at least five times larger than the rest (659 cases); for the 355 with no clear winner and the 2,442 with no population recorded, the system asks. **For lead routing specifically, an unresolvable location escalates to an administrator rather than being guessed**, because the cost of guessing is a stranger's phone number sent to a business 200 miles away.

6. **Slugs follow the same rule.** A unique name gets the bare slug. A collision gets parent-qualified slugs, and the bare path serves a **disambiguation page listing the options** — never a 301 to whichever place we guessed. Two places may not compete for one URL, and neither may a guess.

7. **The 442 hardest cases get no landing pages.** They are hamlets with no population on record and no realistic search demand. They remain resolvable by postcode and selectable in a list; they do not get a page, which also keeps us clear of thin-page risk. The decision is recorded per place in `pageJustified` / `decisionNotes`.

8. **Tested on the known-hard names.** The import carries a fixture asserting the resolver's behaviour for Accrington and Aldershot (must merge), Rush Green and Abbey (must disambiguate), Aish and Allington (must ask), and Becontree (locality and ward must collapse to one place). A resolver that silently changes behaviour on these is a regression.

## 5. Migration — additive, and reversible

Live URLs are indexed. `/locations/hackney`, `/businesses/london/cleaning/{slug}` and the city-scoped routes must not break.

1. Create `Place`, `PlaceAlias`, `PlaceLink`. RLS on.
2. Back-fill England → London → 33 boroughs → 50 neighbourhoods from the existing rows, carrying `legacyLocationId`. Verify **100%** of 83 rows map before going further.
3. Match GSS codes to the 33 boroughs from ONS. London boroughs are the easy case; do them first and keep the mapping as a test fixture.
4. Add `Business.placeId` **alongside** `locationId`. Do not read it yet.
5. Switch reads to `placeId` only once the back-fill is verified.
6. Retiring `Location` is a **separate, separately approved batch**, with redirects verified first.

`LOCATION_MASTER.csv` holds the 83 real rows as they stand today, exported from the live database, every one marked `source = PRIMESTREET_EXISTING`, `confidence = MEDIUM`, GSS and OS identifiers **blank** because they have not been matched yet. That file is the starting point for step 3, and its blank columns are honest rather than filled in from memory.
