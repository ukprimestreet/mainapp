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

## 8. What is actually built, as of 27 October 2026

The plan above is the design. This section is the state of the code, so the two cannot drift silently.

**Built and tested (Phase C):**

| Promise in this document | Where it lives | How it is proven |
|---|---|---|
No full address for a quote | `/get-quotes` asks for a postcode, optionally, and accepts a borough alone | `e2e-leads.mjs`: the stored row has a postcode and no address |
Consent is versioned | `PRIVACY_NOTICE_VERSION` in `src/lib/leads.ts`, stored per request with its timestamp | unit and browser checks |
Marketing consent is separate | A second, unticked box that nothing depends on | browser check that it stays false when untouched |
Contact details are restricted | `leads.customer_contact`, enforced in `revealCustomer()` on the server | browser check: the details are absent from the page, present only after an audited reveal |
The audit log holds no PII | `audit()` is given the reference, never the name, email or phone | both suites assert the detail field contains neither |
A customer is told the truth about supply | the supply check runs before any contact field is rendered | browser check that `#phone` does not exist until the answer is in |
No duplicate leads from one submission | content-derived `idempotencyKey` with a unique index | three simultaneous submissions produce one job |

**Deliberately not built yet, and why:**

- **Matching, `MatchDecision`, the two-paying-business limit and the credit charge** are Phase D. Until then a lead is recorded and worked by hand from `/admin/leads`, which is an honest state rather than a queue that silently fills.
- **No email to the customer on submission.** The only thing we could say is "a business will contact you", and until matching runs we do not know that. The confirmation page says exactly what is known, including "we cannot promise you a quote" where supply is zero.
- **Retention deletion is not automated.** The schedule in §5 is a policy, not yet a cron job. It needs `pg_cron` enabling in Supabase, which is still outstanding.

---

## 9. Matching, as built (Phase D, 27 October 2026)

**The order of operations, which is the whole design:**

1. Count who covers the trade in the area, and record it against the request.
2. Walk four stages in order — exact place, surrounding area, wider council area, nearby **opt-in only** — stopping once two paid places are filled.
3. Within a stage, take businesses in round-robin order: fewest assignments, then longest wait, then id.
4. For each: check the balance, **claim the place**, then **spend the credit**. If the charge fails, the place is released and the business is told why.
5. Record every inclusion and exclusion, including for stages never reached.
6. Set the request's status from how many places are filled, never from how many were attempted.

**Why claim-then-charge and not charge-then-claim.** If the credit went first and the insert then lost a race, we would have taken money for nothing and would be relying on a reversal to put it back. Claiming first means the only failure left is a charge against a claimed place, and that releases the place. A business can be left without the job; it cannot be left without the credit.

| Promise | How it is enforced |
|---|---|
At most two paying businesses | a **partial unique index** on (jobRequestId, paidSlot), plus a CHECK limiting a slot to 1 or 2. Not the matcher's control flow |
Never charged twice for one job | one live assignment per business per job, again a partial unique index; re-running records "they already have this job" |
Never charged for a job they did not get | the credit is spent after the place is claimed; a failed charge deletes the assignment |
A business can say why it missed out | `MatchDecision`, one row per business per run, with words a business could be shown |
Nobody gets work they did not ask for | stage four requires `acceptsNearby`, which defaults to false |
A reversal refunds | `reverseAssignment()` frees the place, writes a REVERSAL ledger row, and leaves the assignment visible as reversed |

**What a business sees.** The job appears in its own dashboard the moment the assignment exists, with the customer's name, phone and email in full — that is what the credit bought, and putting it behind another click would be charging for something and then making it awkward to use. Opening that page is recorded as `deliveredAt`, so "they were sent it and never looked" is a fact rather than a guess when somebody complains.

**Still not built:** notifying the business that a job is waiting (Phase F — today it finds out by opening its dashboard), and escalation when nobody acts.

---

## 10. What needs legal review before launch

1. The lawful basis for sharing contact details with providers.
2. The privacy notice wording and its retention schedule.
3. Business terms for lead credits: what is bought, what is not promised, refunds, disputes.
4. **VAT treatment of £1 credits** (D4) and invoicing.
5. Marketing consent wording and PECR position.
6. Regulated categories — gas, electrical, pest control, healthcare, legal — where advertising rules constrain what a page may claim and whether we may imply a provider is qualified.

Nine of the 50 categories are already flagged for this in `SERVICE_RANKING.csv`.
