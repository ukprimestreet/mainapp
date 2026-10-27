# Lead credits — business terms

**Status: DRAFT for review by a qualified adviser. This is not legal advice.**

Written to describe what the code actually does, so that a reviewer is correcting a true description rather
than inventing a policy the software does not implement. Where the two ever disagree, the code is the bug or
the terms are — but one of them is, and that is the point of writing it this way.

Every statement below has a corresponding guarantee in the system; the right-hand column says where it lives,
so a reviewer can ask for proof.

---

## 1. What a lead credit is

A lead credit entitles a business to receive one customer job request matched to the areas and trades it has
told us it covers. It is not a subscription, it does not affect the business's listing, and it buys nothing
else.

| | Where it is enforced |
|---|---|
One credit, one job request | `spendCredits()` charges exactly one per assignment, with a ledger row |
Credits never expire | nothing in the code expires them |
Listing is free and stays free, with or without credits | no code path removes a listing for a zero balance |
Paying changes nothing about rating, reviews or search position | `BUSINESS_TERMS` as stated on `/register`; no paid field is read by ranking |

## 2. Price

**£1 per credit, excluding VAT.** VAT is added at checkout when it legally applies.

Prime Street charges VAT only once it is VAT-registered and the supply is taxable; HMRC requires registration
when taxable turnover exceeds £90,000 over a rolling 12 months. The base price stays £1 excluding VAT and VAT
handling is configurable to the registration status — decision D4, implemented in `src/lib/vat.ts`.

The first five credits are granted free on approval, once per business, ever.

## 3. What we promise

1. **A job request is sent to a maximum of two paying businesses.** Not an auction, not a list of ten.
   Enforced by a partial unique index in the database, not by application logic.
2. **A business is only sent work in the areas and trades it has chosen**, which it controls itself at any
   time. Work outside those areas is only sent if the business has opted in to nearby work.
3. **A credit is charged only when a job is actually assigned.** If the charge cannot be taken, the
   assignment is removed rather than left looking paid.
4. **The customer's details are real and were submitted by that customer**, with explicit consent to be
   contacted about that job, recorded against the version of the privacy notice they agreed to.

## 4. What we do not promise

- That the customer will answer, reply, or go ahead with the work.
- That the customer has not also contacted other businesses independently of us.
- That the job is of any particular value.
- Any number of leads in any period. Demand is demand.

A lead is an introduction. It is not a sale, and a business that treats it as one will be disappointed by any
lead-generation service, including this one.

## 5. Refunds

A credit is refunded in these cases, automatically where the system can tell:

| Case | How |
|---|---|
The job was taken back because the business did not open it within 24 hours | automatic (`escalateUnopened()`), and the business is emailed to say so |
An administrator reverses the assignment | automatic on reversal, with a reason recorded |
The request turns out not to be genuine | by hand, on request |
The same customer and job reached the business twice through us | by hand, on request |

A credit is **not** refunded because the customer did not answer, chose somebody else, or changed their mind.
That is the risk the credit buys into, and pretending otherwise would make the price a fiction.

Every refund is a ledger row with a reason; nothing is adjusted silently.

## 6. What a business must do with a customer's details

- Use them only to contact that customer about that job.
- Stop contacting them if asked, and tell us.
- Not sell, share or add them to a marketing list.

These are stated in the email that carries the details and on the dashboard that shows them. A business that
generates complaints stops receiving requests — a rule worth having in the terms from day one rather than
inventing under pressure.

## 7. Disputes

Email us with the reference. Every assignment carries a full record: when it was sent, when the business was
emailed, whether and when it opened it, the credit movement, and the reason for every decision the matcher
made. We answer from that record rather than from memory.

## 8. Questions for the reviewer

1. Is consent the right lawful basis for passing contact details to businesses, and what must happen when a
   customer withdraws it after a business already holds their number?
2. Is "a maximum of two businesses" a contractual promise to the customer, the business, or both?
3. Is the 24-hour automatic refund (§5) a liability we should state a limit on, or is it safely ours to give?
4. Do the "what we do not promise" items need stronger wording to be effective in a consumer-facing context,
   given that many of these businesses are sole traders?
5. Does the complaints rule in §6 need a stated process before it can be relied on to stop sending work to a
   business?
