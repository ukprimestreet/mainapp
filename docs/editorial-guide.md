# PrimeStreet editorial guide (CMS how-to + rules)

**Admin → Articles → + New article.** Types: News, Stories, Interviews, Guides, Business of the Week, Insights.

## Workflow
1. **Save draft** any time (only title + author + slug + type needed). Drafts are never public. **Open preview** shows the exact reader view (noindex, admin-only).
2. **Publish now**, or **Schedule** for a future time (London time; BST/GMT handled). Scheduled pieces go live automatically at that time — no cron needed because readers only ever see pieces whose publish time has passed.
3. **Unpublish** returns a piece to draft. Live pieces can't be deleted (unpublish first). Editing a live piece re-checks all publish rules.

## Publish checklist (enforced by the server)
Title ≥ 5 chars · standfirst 30–220 chars · body ≥ 300 chars · author · image has alt text · slug unique.

## Integrity rules (enforced)
- **Disclosure:** Editorial / Sponsored / Partner / Advertorial. Anything but Editorial **requires a sponsor name**, shows a prominent label + note on the page, and is tagged `[SPONSORED]` etc. in the RSS feed.
- **Business of the Week can never be sponsored.** BOTW and Interviews must link ≥ 1 business.
- **Founder-owned businesses:** flag `ownedByFounder` on the business. Any article linking it automatically shows "a business featured here is owned by PrimeStreet's founder", and the editor warns.
- **Editorial balance:** the Articles page warns when > 25 % of the last 20 real published pieces feature founder-owned businesses (min. 4 pieces).

## Formatting (Markdown-lite — no HTML)
`## Heading`, `### Subheading`, `**bold**`, `*italic*`, `[text](https://url)`, `> quote`, `- list`, `1. list`, `![alt](https://image.jpg "caption")`, `---`. Raw HTML/scripts render as plain text; `javascript:` links are dropped. External links get `nofollow ugc noopener`.

## Images
Hero image = URL + **alt text (required to publish)** + credit. Uploads aren't built yet (storage decision pending, see decisions.md).

## Reuse
Link businesses (picker) so the piece appears on their profile. Link a podcast episode so the written interview and episode point to each other. RSS: `/feed.xml` (real, non-sample pieces only). Author pages: `/authors/{slug}`.
