# Email

## One address per purpose
Each kind of email sends from its own address on the verified domain, so a recipient can see what an email is about before opening it and can filter it. Configured by `MAIL_DOMAIN`; a single sender can be overridden with `MAIL_FROM_<PURPOSE>`.

| Purpose | From | Inbox | Used for |
|---|---|---|---|
| `accounts` | accounts@ | send only | Writer invitations, password resets, owner sign-in links, newsletter confirmations |
| `editorial` | editorial@ | send only | Review decisions, the writer welcome and expectations |
| `enquiries` | enquiries@ | send only | A customer enquiry forwarded to a business |
| `reviews` | reviews@ | send only | Review confirmations and moderation outcomes |
| `claims` | claims@ | send only | Business claims, ownership reports, access changes |
| `digest` | digest@ | send only | The weekly newsletter |
| `billing` | billing@ | send only | Subscriptions and payment problems |
| `alerts` | alerts@ | send only | Internal notices to the PrimeStreet team |
| `hello` | hello@ | **monitored** | Mail a person wrote and expects a reply to |

## The two real inboxes
Only **hello@primestreet.uk** is monitored, and **cc@primestreet.uk** is the owner's own address (a recipient, not a sender).

Every send-only email therefore ends with:

> This email was sent from an address that nobody reads, so please don't reply to it: no one will see your message.
> If you need help, or something here looks wrong, email hello@primestreet.uk and a person will answer.

`Reply-To` is still set to hello@ on that mail. The note tells people the truth; the header means a reply that ignores the note lands somewhere a human reads rather than bouncing into nothing.

## Two deliberate exceptions
- **Customer enquiries** (`enquiries`) set `Reply-To` to the **customer**, so a business owner can simply hit reply and reach them. No do-not-reply note, because replying is the whole point.
- **An editor messaging a writer** sends from hello@ and invites a reply.

## Configuration
```
RESEND_API_KEY="re_…"
MAIL_DOMAIN="primestreet.uk"     # turns on the per-purpose senders
MAIL_SUPPORT="hello@primestreet.uk"
```
Without `RESEND_API_KEY` + (`MAIL_DOMAIN` or `MAIL_FROM`), mail is still recorded in `EmailOutbox` and simply not delivered, so nothing is lost before the provider is configured.

Every address above must be an accepted sender on the verified domain in Resend. Add SPF, DKIM and a DMARC record for the domain, or this mail will land in spam.

## The outbox
`/admin/outbox` shows every message PrimeStreet has tried to send, which address it went from, its Reply-To, whether it was delivered, and the error if it failed. It can be filtered by purpose.

## Tests
`scripts/test-mail.ts` — the address scheme, the do-not-reply rule, the two exceptions, and that nothing is lost when no provider is configured.

## Templates
Every email is built from one layout (`src/lib/email/layout.ts`) and a catalogue entry (`src/lib/email/templates.ts`). The layout owns the brand: the **PrimeStreet** wordmark very bold at the top in white and brand yellow on black, the yellow rule beneath it, the footer, and the do-not-reply line. A template only supplies a subject and a list of blocks, so the brand cannot drift apart across emails.

Blocks available: heading, lead, paragraph, button, secondary link, list, numbered steps, facts table, pull quote, note (info / good / bad / warn), code, big stat, divider, spacer.

### Email-client rules this layout follows
- Tables and inline styles only; no flexbox, grid or external stylesheets. Outlook renders through Word.
- 600px maximum, `width:100%` so it still fits a 360px phone, with a media query tightening the padding.
- **The wordmark is text, not an image**, so it still appears when a client blocks images — which many do by default.
- A plain-text alternative is always sent alongside the HTML.
- A hidden preheader gives the inbox preview line.
- All interpolated values are HTML-escaped, so no email can be injected into.

### Previewing
- `npm run emails` renders every template to `out/emails/` with an index page.
- `/admin/outbox/templates` previews them in the dashboard, grouped by who receives them.

### Tests
`scripts/test-email-templates.ts` checks the wordmark, the one-yellow rule, that no off-brand colour appears, responsiveness, escaping, the plain-text alternative, and that only the newsletter carries an unsubscribe link.
