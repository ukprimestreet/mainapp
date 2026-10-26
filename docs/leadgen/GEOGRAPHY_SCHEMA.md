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

## 5. Migration — additive, and reversible

Live URLs are indexed. `/locations/hackney`, `/businesses/london/cleaning/{slug}` and the city-scoped routes must not break.

1. Create `Place`, `PlaceAlias`, `PlaceLink`. RLS on.
2. Back-fill England → London → 33 boroughs → 50 neighbourhoods from the existing rows, carrying `legacyLocationId`. Verify **100%** of 83 rows map before going further.
3. Match GSS codes to the 33 boroughs from ONS. London boroughs are the easy case; do them first and keep the mapping as a test fixture.
4. Add `Business.placeId` **alongside** `locationId`. Do not read it yet.
5. Switch reads to `placeId` only once the back-fill is verified.
6. Retiring `Location` is a **separate, separately approved batch**, with redirects verified first.

`LOCATION_MASTER.csv` holds the 83 real rows as they stand today, exported from the live database, every one marked `source = PRIMESTREET_EXISTING`, `confidence = MEDIUM`, GSS and OS identifiers **blank** because they have not been matched yet. That file is the starting point for step 3, and its blank columns are honest rather than filled in from memory.
