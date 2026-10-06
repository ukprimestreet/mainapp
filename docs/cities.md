# Cities and areas (Phase 10)

PrimeStreet launched as a London title and is built to add cities without rewriting its URLs or diluting its quality rules.

## URL structure
| Page | URL |
|---|---|
| City index (2+ cities) | `/locations` — redirects to the single city when there is only one |
| City hub (areas) | `/locations/{city}` |
| City hub (categories) | `/businesses/{city}` |
| Area / neighbourhood | `/locations/{city}/{area}` |
| Area × category | `/locations/{city}/{area}/{category}` |
| Business profile | `/businesses/{city}/{category}/{slug}` |

Pre-multi-city URLs (`/locations/camden`, `/locations/camden/cleaning`) **308** to their city-scoped form. Renaming a city or an area in admin creates the redirect automatically.

Area slugs are unique **within** a city (`@@unique([cityId, slug])`), so two cities may both have a "richmond". Categories are one shared taxonomy across cities.

## Areas
`BOROUGH` is a top-level area; `NEIGHBOURHOOD` sits inside one via `parentId`. A borough page includes the businesses of its neighbourhoods; a neighbourhood page shows its borough in the breadcrumbs. London ships with all 33 boroughs and ~50 real neighbourhoods, seeded **without** intros so the quality gate keeps them out of the index until an editor writes one.

## Launching a city
A city is `COMING_SOON` until it has real published businesses and an intro of 100+ characters; admin refuses to set it `LIVE` otherwise. While coming soon it is browsable but `noindex`, lists no businesses and says plainly that nothing has been made up while we wait. Launch sets `launchedAt`.

The quality gate (`decideCity` in `lib/seo-engine.ts`) is the only place this is decided, so meta robots, the sitemap and the admin index-health screen can never disagree. A coming-soon city cannot be forced into the index with a manual override.

## Editorial teams
`CityEditor` links authors to cities with a role (`EDITOR`, `REPORTER`, `CONTRIBUTOR`). The city hub names the team and links to each writer, so readers know who is behind the coverage. Articles carry a `cityId`, derived from the area they are about, which scopes city hubs and search.

## Search and near-me
`SearchDoc.citySlug` scopes search to one city; the city chooser only appears with two or more live cities, and an unknown `?city=` is ignored rather than returning nothing. `City.postcodePrefixes` maps a visitor's postcode to a city (longest prefix wins, so `EC` beats `E`). A postcode outside every city we cover, or inside one that has not launched, is told so rather than shown an empty list.

## Admin
`/admin/cities` — coverage per city (areas, areas with intros, real businesses, articles, team). `/admin/cities/{slug}` — city details, team and areas.

## Tests
`scripts/test-cities.ts` (unit), `scripts/e2e-cities.mjs` (end to end).
