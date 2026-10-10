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

## Paying writers: the data we hold

`src/lib/secretbox.ts` is AES-256-GCM with a random 96-bit IV per value and the auth tag stored alongside, so a tampered ciphertext fails to decrypt rather than returning something plausible. Node's crypto only — no dependency to audit. Encrypted at rest: the **bank account** (`bankEnc`) and the **UTR** (`utrEnc`).

The key lives in `FIELD_KEY` (32 bytes, base64 or hex) and never in the database, so a stolen dump is not enough on its own. **Without the key we refuse to save.** Storing bank details in plain text because the environment was misconfigured is the one outcome worse than not storing them, so the form disables itself and says so. `FIELD_KEY_OLD` is tried on decrypt only: to rotate, move the current key there, set a new `FIELD_KEY`, re-save the affected rows, then drop it.

Decisions worth keeping:

- **Payment details are not part of the 90% profile gate.** They are a condition of being *paid*, not of being allowed to write. Asking a writer for their bank details before they have been commissioned is how a scam behaves, so the nav only prompts once money is actually due.
- **The account is never rendered back into the page.** Only the masked last four. Prefilling it would put the number in the page source on every visit — browser cache, screen share, over a shoulder — for no benefit, since recognising your own account needs four digits and changing it means typing it again. It also means a blank bank field reliably means "leave it alone", so an address change cannot re-write the stored account or falsely bump the date.
- **`bankLast4` is deliberately plain text,** so an admin can match a remittance to an account without anything being decrypted.
- **An admin reveal is a form post that is logged first.** The audit log records who looked and when — never what they saw. The same applies to a writer's own changes: the entry says the bank account changed, not what it changed to.
- **A reveal that cannot be decrypted says so plainly** and tells the admin to ask the writer to re-enter it, rather than showing a partial or guessed account.
- **Money owed to someone we cannot pay is surfaced before the payment run**, on the admin payments page and to the writer the moment the fee becomes real. Approving an invoice we then cannot pay is worse than saying so immediately.
- **A writer can delete what we hold** from the same page, in one click.

Tests: `scripts/test-secretbox.ts` (36 checks: round trips, tamper detection on each part, key rotation, the refusal without a key, and UK sort code/account/UTR/VAT validation) and `scripts/e2e-payee.mjs` (22 checks through the real form, including that the account number appears in neither the database, the page source, nor the audit log).
