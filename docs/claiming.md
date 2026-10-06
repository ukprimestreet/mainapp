# Business claiming, verification and owner accounts

## Claim lifecycle
1. **Claimant** submits the claim form (`/claim`). Business → `PENDING`. A status link is emailed.
2. **Email confirmation** (POST button on `/claim/status/{token}`, so email scanners can't confirm for them). **An admin cannot approve until this is done.**
3. **Evidence** accumulates and is shown to the admin:
   - ✓ email confirmed
   - ✓ email is on the business's own website domain (`domainMatch`; free-mail like gmail never counts; look-alike domains rejected)
   - ✓ phone call-back: admin phones the business's **listed** number (not the claimant's), reads out a one-time 6-digit code, the claimant enters it on the status page (stored hashed, 48 h expiry, 5 attempts)
4. **Admin decision** — Approve / Request more info / Reject (reason mandatory for the last two; emailed to the claimant).
   - `CLAIMED` needs a confirmed email.
   - `VERIFIED` additionally needs a business-domain email **or** a successful phone call-back. Enforced server-side, not just in the UI.
   - Approving closes any competing open claims on the same business (one owner at a time) and creates the owner account.
5. Claimants can add information, or withdraw (business returns to `UNCLAIMED`).

Not built (blocked on storage): **document upload** verification (e.g. utility bill, Companies House letter). The evidence model is ready to take it.

## Disputes and revocation
Anyone can report a claimed profile (`/claim/dispute?business=`). It lands in the admin queue tagged **Dispute**; nothing changes until a human decides. **Revoke ownership** (admin, reason mandatory) removes every owner, returns the profile to `UNCLAIMED`, emails the former owners, and takes effect **immediately, even for already signed-in sessions** (every owner request re-checks the live ownership link).

## Owner accounts (passwordless)
- Sign in at `/owner/login`: enter email → one-time link (valid 20 min, single use, atomic consume, stored hashed). The link page needs a **POST click** so scanners can't burn it.
- Same response whether or not the email has an account (no enumeration). Caps: 3 links/hour/account, 10/hour/IP-hash.
- Session: signed httpOnly cookie, 14 days, signed with a different purpose prefix from the admin cookie (neither can be replayed as the other). "Sign out everywhere" bumps `Owner.sessionVersion`, killing every device.

## Authorisation (the important bit)
Every owner page and server action goes through `requireBusiness(businessId)` → `ownsBusiness(ownerId, businessId)`. Review actions authorise through the review's business. Non-owners get a **404** (not 403) so the page's existence isn't revealed. Browser tests tamper hidden `id`/`reviewId` fields to prove one owner cannot touch another's business or reviews.

## What owners can do
- **Edit profile** (summary, description, phone, website, private contact email, address, postcode, services, areas, year, socials, image address, structured opening hours). Edits go **live immediately** and are logged field-by-field (`BusinessEditLog`: from → to). Admins can **revert** any edit (Admin → Owner inbox).
- **Name / category / area** can't be changed directly: they raise a change request for a human.
- **Reviews**: reply publicly (10–1500 chars), update/remove their reply, report a review (stored as a *verified owner* report; it doesn't hide the review by itself). They cannot edit or delete reviews.
- **Tell us your story**: pitch editorial coverage. Always labelled as not guaranteed and not for sale; admins set a status + note the owner sees.
- **Dashboard**: profile views (30 days, humans only — bots/crawlers filtered, admins excluded), completeness checklist, unanswered reviews.

## Public profile effects
Claimed/Verified badge; owner socials shown; "Profile updated by the business on {date}"; "Not the owner? Dispute this claim" link.

## Security checklist (all covered by tests)
Token hashing · single-use links · expiry · forged/tampered cookies · cross-purpose cookies · cross-owner isolation · live revocation · session invalidation · no account enumeration · prefetch-safe confirmations · admin-only evidence overrides impossible (rules enforced in `decideClaim`).

## Known gaps / next
Document upload verification · multiple team members per business (`BusinessOwner.role` exists: OWNER/MANAGER, no invite UI yet) · owner notifications by email on new reviews · email delivery itself (see docs/reviews.md — needs `RESEND_API_KEY`).
