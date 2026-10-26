# Lead routing and privacy

**Version:** 0.1 · **Date:** 26 October 2026 · **Status:** design. Not built, not reviewed by a lawyer.

**This document does not establish compliance.** It sets out what we intend to do so that a qualified UK adviser can review it. The master plan and the build prompt both require that review before any live lead distribution, and neither I nor this document substitutes for it.

---

## 1. Lead lifecycle

| State | Meaning |
|---|---|
`SUBMITTED` | the form posted and validated
`VALIDATED` | schema, spam and duplicate checks passed
`QUALIFIED` | resolved to a real category and a serviceable place
`MATCHING` | the engine is running
`PARTIALLY_ASSIGNED` | one paying business has it
`ASSIGNED` | two paying businesses have it — the ceiling
`UNASSIGNED` | nobody eligible
`ESCALATED` | an administrator has been alerted
`CLOSED` / `REJECTED` | finished, or refused with a reason

Per recipient, `LeadAssignment.state`: `RESERVED → ASSIGNED → DELIVERED → ACCEPTED`, or `FAILED` / `CANCELLED`. These are deliberately distinct. "Reserved" is not "delivered", and a lead is **never** marked assigned when the assignment failed.

## 2. What qualifies as a saleable lead

A lead may consume a credit only if **all** hold:

1. Contactable: a syntactically valid email **and** a phone number.
2. Resolved to a real `Place` and a real `Category`.
3. The place is `serviceable` and the business's declared coverage includes it.
4. A job description with enough substance to act on.
5. Not a duplicate — same email or phone, same category, same place, within 7 days.
6. Not spam: honeypot clear, form-token timing plausible, email not disposable, rate limits not breached.

**Not a qualified lead:** test submissions, a business enquiring about its own listing, a request for a place no provider covers, or an enquiry for a service we do not list.

## 3. Duplicate, invalid and refund rules

- **Duplicate** (same customer, same job, within 7 days): no new charge. It attaches to the existing `JobRequest`.
- **Invalid** (unreachable details, spam, out of area, not a real job): no charge, and if a credit was reserved it is reversed with a `REVERSAL` ledger row.
- **No automatic refund** because a customer did not answer the phone. The customer asked for help; the business got the opportunity. A published guarantee could change this, and until one exists the answer is no — stated plainly in the business terms rather than argued case by case.
- **Disputes** go to a human, with the ledger and the audit trail as the evidence. Every adjustment is an `ADJUSTMENT` row naming the administrator and the reason.

## 4. Provider matching

Four stages, stopping as soon as there are enough eligible recipients: exact place → parent town/borough → wider administrative area → nearby places, the last **only** where a business has opted in under an explicit distance policy.

Eligibility at every stage: category matches (including alias resolution), listing active and not sample or suspended, coverage genuinely includes the place, credit balance ≥ 1 for a paid assignment, not already assigned this lead, fewer than two paid slots taken.

Every inclusion and exclusion writes a `MatchDecision` row with its reason. That record is what makes "why did my competitor get this and I didn't" an answerable question.

**We never invent a provider, and never imply a provider has accepted a job.** The customer is told their enquiry has been sent to local businesses who may contact them — not that anyone is booked, confirmed or on the way.

Allocation among equally eligible businesses is round-robin on least-recently-assigned, so the same business does not always win.

## 5. Personal data

### What we collect, and why each field is there

| Field | Why | Required |
|---|---|---|
Name | so a business can address the customer | yes
Email | contact, and the duplicate check | yes
Phone | the channel trades actually use | yes
Postcode or locality | routing to a real place | yes
Service category | routing | yes
Job description | so a business can judge whether it can help | yes
Urgency, preferred contact time | useful, not necessary | no
Marketing consent | separate purpose | no, **and never pre-ticked**

**We do not ask for a full address to request a quote.** The job location is a locality or a postcode; the street address is between the customer and whoever they hire.

### Lawful basis

Sharing contact details with up to two businesses is the **core service the customer requested**, and the intended basis is performance of a contract / legitimate interests, with the sharing made explicit at the point of submission. Marketing is separate, opt-in, and never bundled.

**This is the paragraph a lawyer must sign off.** It is also where getting it wrong is most expensive.

### What the form must say, before submission

- Who operates the platform.
- That the enquiry will be shared with **up to two** local businesses so they can contact them.
- That those businesses are independent and we do not perform the work.
- How long we keep it, and how to get it deleted.
- A link to the privacy notice, with its version recorded against the lead.

`JobRequest.consentVersion` and `consentAt` store which notice they agreed to, so a change in wording never retroactively re-characterises what someone consented to.

### Who can see what

| Who | Sees |
|---|---|
Recipient business | the full enquiry **for leads assigned to it only** |
Any other business | nothing. Not the lead, not its existence |
Administrator | everything, subject to role (**pending D3** — individual admin accounts do not exist yet) |
The public | nothing |

Enforced server-side at a single checkpoint per audience, in the pattern `requireBusiness()` already uses. Hiding a button is not an access control.

### Retention

| Data | Retention | Then |
|---|---|---|
Unassigned / rejected lead | 90 days | delete |
Assigned lead, contact details | 12 months | anonymise, keep the commercial record |
Credit ledger | 7 years | kept — accounting record |
`MatchDecision`, audit log | 24 months | kept, no customer PII in it |

A deletion request removes the contact details and leaves the anonymised commercial record, which is what keeps the accounts honest without keeping the person.

## 6. Security

Server-side authorisation on every read; rate limiting and honeypot on the form; `ipHash` rather than raw IP; HTTPS only; secrets in the environment, never the database; row-level security on every table; audit rows for every credit movement and every admin action; `secretbox.ts` (AES-256-GCM) available for anything that needs encrypting at rest.

## 7. Complaints

A named route — `hello@primestreet.uk`, the one monitored address — for: "a business contacted me and I did not ask", "I want my details deleted", "I was contacted by more than two", "the business was not what it claimed". Logged, answered by a person, and the pattern reviewed. If a provider generates complaints, it stops receiving leads; that rule belongs in the business terms from day one rather than being invented under pressure.

## 8. What needs legal review before launch

1. The lawful basis for sharing contact details with providers.
2. The privacy notice wording and its retention schedule.
3. Business terms for lead credits: what is bought, what is not promised, refunds, disputes.
4. **VAT treatment of £1 credits** (D4) and invoicing.
5. Marketing consent wording and PECR position.
6. Regulated categories — gas, electrical, pest control, healthcare, legal — where advertising rules constrain what a page may claim and whether we may imply a provider is qualified.

Nine of the 50 categories are already flagged for this in `SERVICE_RANKING.csv`.
