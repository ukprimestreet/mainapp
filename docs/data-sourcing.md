# Sourcing the launch directory (real data)

**Status: BLOCKED on a human-curated dataset.** The importer, dedupe, provenance and admin tooling are done. Nobody (incl. the build agent) may invent businesses. The launch target is 150–300 quality profiles.

## What is allowed
- Facts you collected yourself (visiting, phoning, public websites) written **in your own words**.
- Details supplied by the owner (best: ask them, record `source = "Owner supplied 2026-xx-xx"`).
- Open data with a compatible licence: Companies House (OGL) for legal name / registered address / incorporation year; OpenStreetMap (ODbL, needs attribution) for location facts.

## What is NOT allowed
Copying descriptions, photos or reviews from Google, Yell, Trustpilot, Facebook, TripAdvisor, etc. Scraping those sites. Inventing reviews, quotes or "facts". Implying endorsement.

## Workflow
1. Fill `data/businesses-template.csv` (one row per business). `services` separated with `|`. `source` is mandatory.
2. Admin → Import → paste/upload → **Dry run**. Fix errors; check duplicates.
3. Import for real. Profiles become **Unclaimed**, visible, `isSample=false` (so indexable once area/category thresholds are met).
4. Admin → Businesses → *Delete all sample businesses* once real data is in.
5. Before indexing a location page, add an original `intro` to that `Location` row.

## Prioritisation
Independent/local, searchable, genuinely local presence: cleaners, removals, logistics, restaurants/cafes, barbers/salons, gyms, estate agents, builders/trades, accountants/solicitors, local retail, startups. Spread across ≥ 8 boroughs and every category so pages clear the 3-business index threshold.
