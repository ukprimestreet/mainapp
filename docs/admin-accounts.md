# Administrator accounts

**Decision D3, implemented 26 October 2026.** Individual accounts with roles, replacing the single shared `ADMIN_PASSWORD`.

**Written for:** whoever operates and extends the admin.

---

## Why

The admin was one shared password with no `Admin` table and no roles. Two consequences mattered:

- Role-based restriction of customer contact details was **impossible** — there was no identity to attach a role to.
- The audit log could only ever say *"admin"*, never **which** admin.

For a system that shares members of the public's phone numbers with businesses and moves money between accounts, that is the gap hardest to explain afterwards.

## The migration, which completes itself

Both doors are open, and the old one closes on its own:

1. The shared `ADMIN_PASSWORD` keeps working **while no individual account can sign in**.
2. The moment one account has a password, `legacyLoginAllowed()` returns false and the shared route stops — including for cookies already issued through it, so an old cookie cannot outlive the door it came through.

Nobody has to remember to turn the old door off, and nobody can be locked out, because the old door stays open until the new one works.

**Escape hatch:** `ADMIN_LEGACY_LOGIN=allow` forces the shared password back on. For the case where the first account is created and then nobody can reach it. Deliberate and visible, never a default.

### Creating the first account

```
npm run admin:create -- --email=you@example.com --name="Your Name" --role=SUPER_ADMIN --schema=public
```

It **never takes a password and never prints one.** The account is created with no password and a one-time link, printed once to the terminal; the person follows it and chooses their own. Add `--email-link` to send it as well.

That is also why there is no administrator registration page anywhere: an account can only come from this script, or from somebody who already holds `admins.manage`.

## Roles

| | Super admin | Admin |
|---|---|---|
Leads: view, assign, see customer contact details | ✓ | ✓ |
Moderation, editorial, listings | ✓ | ✓ |
Read the audit log | ✓ | ✓ |
Money: revenue, credits, payments, refunds, bank details | ✓ | — |
Manage administrators | ✓ | — |
Settings and automations | ✓ | — |

`ADMIN` deliberately **includes** `leads.customer_contact`: an administrator who cannot see the customer cannot assign a lead by hand. The control that matters is that every such action is recorded against their name, not that the data is hidden from the people doing the work.

### Adding a capability

`PERMISSIONS` in `src/lib/admin-users.ts` is the list, `GRANTS` maps roles to it. Adding a capability means adding it there first — which is what stops a new screen quietly inheriting more access than it should.

## Enforcement

| Use | For |
|---|---|
`requireAdmin()` | any admin page or action |
`requirePermission("x")` | **every protected operation.** Redirects when refused |
`adminCan("x")` | deciding what to render. **Never the only control** |

A hidden button is not an access control. Every server action calls `requirePermission` before it does anything.

A legacy shared-password session passes every permission check. That is the pre-migration state: refusing it would lock the only existing administrator out of their own site. It is exactly why individual accounts exist, and why the legacy route closes as soon as one works.

## Sessions

- Signed, httpOnly, 8 hours, `secure` in production.
- The token carries the admin id, role and session version — **not** permissions, so a role change takes effect immediately rather than when the cookie expires.
- `adminSession()` re-reads the account on every call. Deactivating someone, changing a role or revoking sessions is effective at once.
- Setting a password bumps `sessionVersion`, signing that person out everywhere. So does **Sign out of every device** on `/admin/account`.
- Deactivating an administrator revokes their sessions in the same operation.

## Passwords and throttling

scrypt via `src/lib/author-password.ts` (N=16384, r=8, p=1, 64-byte key) — the same hashing already proven for writers. Minimum 10 characters, no common passwords, not the account name.

Login attempts are recorded in **`AdminLoginAttempt`, in the database**, so throttling survives a deploy and leaves a trail if someone is probing the door: 8 failures per account per hour, 20 per IP per hour. No password or hash is ever written there — only a hash of the email, enough to throttle per account without storing it.

Sign-in does not reveal which half was wrong, and runs a password verification even when the account does not exist, so a missing account and a wrong password take the same time to answer.

## Two-factor authentication

Opt-in per account, at `/admin/account`. TOTP (RFC 6238) in `src/lib/totp.ts`, Node crypto only — no dependency to audit for something this sensitive. Works with any authenticator app.

- The secret is **encrypted at rest** (`src/lib/secretbox.ts`, AES-256-GCM) and never stored in the clear. Two-factor is unavailable when `FIELD_KEY` is not configured, rather than falling back to storing it plainly.
- A new secret is unconfirmed until a correct code proves the app has it too.
- One step of clock drift either side is accepted, so a slightly wrong phone clock does not lock anybody out.
- **Eight recovery codes**, shown once, stored only as hashes, each usable once. Using one is itself an audited event.
- Turning two-factor **off** requires a current code, so a stolen session cannot remove the protection.
- No QR-code library: the provisioning URI and the secret in groups of four are enough to add an account by hand, and a QR encoder is a lot of surface area for a convenience.

## The audit log

`src/lib/audit.ts` is the only way audit rows are written. All 35 call sites across 22 files were migrated to it, so an entry now carries `actorId`, `actorEmail` (as it was at the time, surviving a rename) and `actorKind`.

- `audit()` resolves the current administrator itself, so a call site cannot forget to pass it.
- Rows written **before** this change keep a null actor. Back-filling a name onto an action nobody can attribute would be worse than an honest gap.
- A legacy shared-password session records `actorKind: "SYSTEM"` — authenticated, but genuinely not attributable to a person.
- Audit writes were moved **out** of two `db.$transaction` calls: a failed audit write must not roll back a publish.

**Never** put a password, a hash, a card number, a bank account or a customer's contact details in `detail`. Revealing a writer's bank details is itself an audited event, and what the log records is *who looked*, not what they saw.

## Tests

`scripts/test-admin-users.ts` — 77 checks: the permission matrix including every capability an `ADMIN` must not have, account creation, the one-time setup link being single-use, password rules, sign-in including the non-enumerating failure, deactivation, durable throttling (and that no attempt row holds a password), session tokens carrying identity and being rejected when tampered with or revoked, TOTP including drift and malformed input, recovery codes being single-use, and audit entries naming the administrator while system actions name nobody.

## Still to do

- **Production has none of this.** `npm run admin:ddl -- --schema=public`, then create the first account.
- Enforce two-factor for `SUPER_ADMIN` rather than leaving it optional, once there is more than one.
- `requirePermission` is wired into the new screens. The **older** admin actions still call `requireAdmin()` and so are open to any administrator; each needs its proper permission as it is next touched.
- `ADMIN_PASSWORD` and `ADMIN_EMAIL` stay in the environment until individual login has been used in production. Remove them only then.
