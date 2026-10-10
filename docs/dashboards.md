# The three dashboards

PrimeStreet has three signed-in areas, built on one system: `/admin` (us), `/write` (journalists) and `/owner` (businesses). They share `src/components/dash/` — `Shell` (layout and sidebar), `Icon`, `Chart` and `Ui` (cards, metrics, tables, notices) — so a change to the system reaches all three rather than drifting into three looks.

`src/components/Dash.tsx` re-exports that system and keeps the older names (`Panel`, `Stat`, `StatRow`, `DashTable`) pointing at the new components, which is why pages written before the rebuild still render correctly.

## What is shared

- **Dark grouped sidebar.** On mobile it is a `<details>` drawer, which needs no JavaScript and therefore cannot break while the page is still hydrating.
- **Charts are inline SVG computed on the server.** No charting library, no third-party script, no client-side fetch. Each one carries `role="img"` and a descriptive label, so a screen reader is told what the shape means rather than being read a list of numbers.
- **Every series is dense.** Missing days are zeros (`src/lib/analytics.ts`), so a chart never implies activity on a day that had none, and two series are always comparable.
- **Deltas compare against the equally long window before.** Not against a hand-picked baseline.

## What each number is

Everything on every dashboard is counted from rows. Nothing is sampled, modelled or estimated, which is why any figure can be recounted by hand if someone disputes it. Bots and admin sessions are excluded from view counts (`isBotUA`), so our own browsing never inflates a business's figures or a writer's readership.

| Table | Written by | Read by |
|---|---|---|
| `BusinessStat` | `countView()` on a business profile | owner insights, admin money |
| `ArticleStat` | `countArticleView()` on an article page | writer performance |
| `BusinessClick` | the click tracker on website/phone/directions | owner insights (Premium) |
| `SearchTerm` | the search route | owner insights, admin search |

## Admin

Grouped Overview / Editorial / Directory / Revenue / Reach / System.

- **Moderation** is one queue instead of four (pending reviews, claims, submissions, owner change requests), oldest first, with anything stale flagged. Four separate queues meant the quiet one was never looked at.
- **Money** shows MRR, at-risk subscriptions, churn, failed and abandoned checkouts, and what is owed to writers.
- **Automations** is the lifecycle programme's control panel: every rule off by default, a per-run cap, a dry run that lists the actual recipients before anything sends, run now, run history, and one button that stops everything.
- **Commissions** and **Writer payments** are the other half of the writer dashboards: see below.
- **Audit log** records who did what. Money and moderation decisions are written there, so a dispute has an answer.
- **Settings** holds what an admin can change without a deploy. Secrets stay in the environment.

## Writers

- **Commissions** — accept or decline work. Declining needs a reason so an editor can reassign quickly, and declining is not held against anyone.
- **Performance** — reads of published work, with the honest framing that a quiet piece is not a bad piece and that readership affects neither pay nor future commissions.
- **Payments** — what is owed, invoiced, approved and paid, and a form to raise an invoice.
- **Notifications** — every editorial decision lands here as well as in email, because a decision that exists only in an inbox is one the recipient may never see (`src/lib/notify.ts`).
- **Style guide** — the house rules, in the same place as the work.

A writer cannot submit anything for review until their profile reaches 90% and they have accepted the author terms (`src/lib/author-profile.ts`). The admin commissioning form applies the same gate, so we cannot commission someone who would then be blocked from delivering.

## Business owners

The nav shows **one** business plus a switcher, rather than repeating every link for every listing.

- **Insights** — views, clicks, enquiries, conversion, and a comparison against the average for the same category and area. An average, never a league table: we never name another business and never tell them about this one.
- **Photos** — reorder by dragging *or* with Up/Down buttons, because drag-only excludes keyboard users. First photo is the cover.
- **Offers**, **Billing** (including what you keep if you cancel), **Team**, **Opening hours** (holidays and one-offs), **Help**.
- **Team** refuses to remove the last manager. A listing with nobody able to update it is a worse outcome than an awkward error message.

## Money: the rules in code, not just in a policy

`src/app/admin/editorial-money-actions.ts` enforces these:

- A fee is agreed **before** the work and never adjusted afterwards. Readership cannot change it.
- A commission cannot be marked delivered without a fee set, so a writer always has something to invoice.
- Delivering a commission is the only thing that creates money owed — a fee cannot appear from nowhere.
- **Approving is not paying.** They are separate states, and an unapproved invoice cannot be marked paid. "Marked paid" triggers an email saying the money is on its way, so it is only ticked once the transfer has gone.
- Cancelling a commission requires a reason the writer reads, and one that was already accepted gets an explicit offer to pay for work done.
- A queried invoice goes **back** to the writer ready to invoice again. Nothing is written off silently.
- Every one of those actions writes to the audit log with who did it.

## The daily job

`/api/cron` runs the enabled automations, then prunes orphaned search rows. It is scheduled in `vercel.json` for 09:30 UTC.

It refuses to run unless `CRON_SECRET` is set and matches the bearer token, and it answers `404` whether the secret is wrong *or* simply unset — never falling back to open. An unprotected endpoint here would let anyone on the internet trigger a marketing send. The automations page says plainly whether the job is wired up, so "it is on" is never assumed.

## Testing

- `scripts/test-team-money.ts` — invitation single use, bot exclusion from read counts, and the money state machine (20 checks).
- `scripts/a11y.mjs` — axe-core (WCAG 2.1 AA + best practice) at 375px and 1280px across every dashboard page, plus a responsive overflow check.

The overflow check asks whether the page **actually** scrolls sideways (attempt the scroll, read `scrollX`) rather than comparing `documentElement.scrollWidth` to the viewport. The latter is inflated by any wide child inside a horizontally scrollable container — a responsive table is *meant* to scroll — and reported overflow that no user could ever see. A check that cries wolf gets ignored, which is worse than not having it.
