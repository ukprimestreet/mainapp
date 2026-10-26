# England geography — the acquired dataset

**Fetched:** 26 October 2026 · **Regenerate with:** `node scripts/fetch-england-places.mjs`

Every row in these files came from the ONS Open Geography Portal. **Nothing was typed from memory**, which is the point: the master plan forbids building this from an AI's recall, and at 70,000 rows that would have been fabrication at a scale nobody could audit.

## Attribution — required, not optional

> Contains ONS data © Crown copyright and database right 2026. Contains OS data © Crown copyright and database right 2026. Licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

The OGL requires this acknowledgement **wherever the data is published**. It is not yet on the site. Adding it — a footer line or a `/data-sources` page — must ship with the first page that uses this data, not afterwards.

## The files

### `ENGLAND_PLACES.csv` — 70,657 rows, 16 MB

Every named place in England, from the **Index of Place Names in Great Britain**, July 2016 vintage (hosted 2022). 48,894 distinct names, 0 rows missing coordinates.

| Type | Rows | What it is |
|---|---|---|
`LOC` | 43,084 | **Locality** — villages, hamlets, named settlements. The layer this project is built on |
`PAR` | 11,068 | Civil parish |
`WD` | 8,040 | Electoral ward (2015 vintage) |
`BUA` | 5,376 | **Built-up area** — towns and cities |
`BUASD` | 1,797 | Built-up area sub-division — suburbs and districts |
`NMD` | 562 | Non-metropolitan district |
`UA` | 214 | Unitary authority |
`MD` | 178 | Metropolitan district |
`LONB` | 97 | London borough |
`CTYHIST` | 96 | Historic county |
`CTYLT` | 72 | County (lieutenancy) |
`CTY` | 49 | County |
`NPARK` | 15 | National park |
`RGN` | 9 | Region |

Row counts per type exceed the number of real areas because a place that spans two areas gets one row per area — `split_indicator` marks those. Deduplicate on `place_id` before treating these as a list of places.

### `ENGLAND_ADMIN.csv` — 6,834 rows, 974 KB

The **current** administrative skeleton: ward → local authority → county/unitary → region → country, every tier with its GSS code. From `WD26_LAD26_CTYUA26_RGN26_CTRY26_UK_LU`, 2026 vintage.

**9 regions · 153 counties and unitary authorities · 296 local authorities · 6,834 wards.**

### Why two files, and which one to trust

The place index is **July 2016**. English local government has been reorganised repeatedly since — Buckinghamshire, Northamptonshire, Dorset, Somerset, Cumbria and North Yorkshire among others. So:

- **Place names and place types: trust `ENGLAND_PLACES.csv`.** Names are stable; it is the only free source with locality-level coverage at this depth.
- **Current administrative parentage: trust `ENGLAND_ADMIN.csv`.** The `lad_2015_*` columns in the places file are a decade old and partly stale.

Joining them is a Phase B task: match each place to its current local authority, and **flag rather than guess** where the 2015 LAD code no longer exists.

## What this dataset does not contain — verified, not assumed

The master plan lists nine named areas around Dagenham. Checked against the index:

| Name | Result |
|---|---|
Becontree, Chadwell Heath, Becontree Heath, Marks Gate | **Confirmed** as localities in Barking and Dagenham |
Rush Green | **Exists, but in Havering** — plus East Hertfordshire, South Bucks, South Norfolk. Not a Barking and Dagenham locality |
Castle Green | **Exists, but in Barnsley, Surrey Heath and Warwick.** Not in Barking and Dagenham |
Dagenham Dock, Dagenham Green, Beam Park | **Not in the index at all** |

Four of nine confirmed. This is the master plan's own warning proved right — *"do not blindly assume every name is an officially defined neighbourhood"* — and it has two consequences:

1. **The alias layer is essential, not a nicety.** Dagenham Dock is a real place to anyone living there (a station and an industrial area); Beam Park is a development completed after 2016. People search for both. They need to exist as searchable aliases pointing at a canonical place, each with its own recorded source — never invented, and never silently promoted to the status of an ONS locality.
2. **A name is not an identity.** 9,747 of 48,894 names — **one in five** — appear in more than one place. There are six Rush Greens. Matching on a name alone would send a Havering lead to a Hertfordshire business. Everything must key on `place_id` and GSS codes.

## A correction this data forced

`LOCATION_AND_LEAD_SYSTEM_SPEC.md` previously said Rush Green was "administratively in Barking and Dagenham but commonly associated with Romford". That was backwards. The locality sits in **Havering**; what belongs to Barking and Dagenham is a *ward* named "Eastbrook & Rush Green". The spec has been corrected. It is a good example of why the `PlaceLink` edge table exists: a name can be attached to two authorities in two different senses, and a single-parent tree cannot express that.

## Still missing

- **Address-level data.** Selecting an exact building needs Royal Mail PAF or OS AddressBase — licensed and chargeable. Decision D2.
- **Boundaries.** These files carry a point per place, not a polygon. Point-in-polygon locality resolution would need the ONS boundary products, which are much larger.
- **Post-2016 places.** New developments are absent by definition. They arrive through the alias layer with a recorded source.
- **Wales, Scotland, Northern Ireland.** England only, as the master plan directs. The same two services cover the rest of Great Britain by changing one filter.
