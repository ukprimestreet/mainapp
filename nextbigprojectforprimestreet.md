# Next big project for PrimeStreet

<!-- Paste the prompt below. -->

# FOLLOW-UP DEVELOPMENT PROMPT: LOCATION-AWARE BUSINESS REGISTRATION, AUTOMATED LEAD DISTRIBUTION, LEAD CREDITS AND ADMIN LEAD MANAGEMENT

## 1. PROJECT CONTEXT

This project is an extension of an **existing business directory platform**. Businesses already register on the platform to list their businesses, receive reviews and gain visibility.

YOUR ROLE

Act as a coordinated team of five senior website developers, each with over 20 years of experience, supported by senior specialists in technical SEO, local SEO, keyword research, UX/UI, conversion copywriting, data engineering, analytics, quality assurance, privacy, and lead generation.


Do not build a separate directory or replace the existing business registration system. First inspect the current codebase, database schema, authentication, business profiles, location fields, review system, subscription or payment system, admin dashboard and notification infrastructure.

Preserve all working functionality. Extend the existing architecture and reuse existing components, data and services wherever appropriate.

The new functionality must connect the directory to our UK-wide local services lead-generation system.

The core business model is:

1. Businesses register and list their business for free or through any existing paid listing options.
2. Each business must identify its exact operating location and the larger geographical areas it serves.
3. When a customer submits a job request, the system identifies relevant businesses in that location and service category.
4. Businesses receive urgent notifications inviting them to contact the customer immediately.
5. Lead distribution prioritises businesses with available lead credits, subject to the rules below.
6. New businesses receive five free lead credits.
7. Businesses can purchase additional credits at £1 per credit.
8. Administrators can monitor every lead, intervene in assignments and manually assign leads where necessary.

**Important:** Listing in the directory and purchasing leads must remain separate concepts. A business must be able to list for free without being forced to buy lead credits.

---

## 2. MANDATORY FIRST STEP: AUDIT THE EXISTING PLATFORM

Before modifying code, investigate and document:

- Current business registration and onboarding flows.
- Existing country, region, town, city, postcode and address fields.
- Current service/category selection.
- Existing business directory search and location pages.
- Existing database entities and relationships.
- Existing user roles and admin permissions.
- Existing email, SMS and in-app notification systems.
- Existing payment provider and transaction records.
- Existing business listing plans and any existing subscriptions.
- Existing lead forms or enquiry functionality, if present.
- Current frontend framework, backend framework and database.
- Existing tests, coding standards and deployment configuration.

Create or update:

- `EXISTING_PLATFORM_AUDIT.md`
- `LOCATION_AND_LEAD_SYSTEM_SPEC.md`
- `DATABASE_CHANGELOG.md`
- `PROJECT_TODO.md`
- `BATCH_LOG.md`

Do not assume the platform is built with a particular framework. Use the actual technology already present.

Do not remove, rename or restructure existing features unnecessarily.

If a critical architectural decision is required, document the issue and recommend the safest solution before proceeding.

---

## 3. MANDATORY BUSINESS LOCATION SELECTION

Every business registering on the platform must select its operating location. This is essential because location determines which job leads the business can receive.

There must be two ways to set a business's location.

### Option A: Automatic postcode and address lookup

The preferred registration experience should be:

1. The business enters its UK postcode.
2. The system retrieves matching addresses using a reliable address lookup service.
3. The business selects its exact business address.
4. The system automatically resolves the address into the appropriate geographical hierarchy.
5. The business sees the detected location and confirms it.
6. The business completes its registration.

For example:

- Country: England
- County or administrative area: Berkshire, where applicable
- Local authority or administrative area: West Berkshire
- Main town: Newbury
- Local area: Donnington

The system should derive the correct geographical hierarchy from a maintained location database and the selected address. Do not infer a locality from postcode text alone.

Use authoritative or reliable geographical and address data, such as suitable Ordnance Survey or other licensed address datasets. Verify licensing, coverage and API costs before selecting a provider.

Do not hard-code a small list of postcodes or locations.

If the postcode lookup fails, offer the manual selection process.

### Option B: Mandatory manual location selection

If the business does not use address lookup, require it to select the location manually through cascading dropdowns.

The expected hierarchy is:

**Country → Region → Main town or city → Local area**

Where the geography requires additional levels, include the appropriate county, local authority, district or borough between these levels.

For example, a business in Donnington might select:

- Country: England
- Region/county: Berkshire
- Administrative area: West Berkshire
- Main town: Newbury
- Local area: Donnington

Another example:

- Country: England
- Region: Greater London
- Main town or borough: Dagenham
- Local area: Becontree

Use the correct administrative and geographical terminology for each part of the UK. England, Wales, Scotland and Northern Ireland do not all use identical administrative structures.

For Greater London, represent the relevant borough and locality correctly. Do not treat every neighbourhood as an official town or administrative region.

### Location selection rules

- Location selection is mandatory before a business can complete registration and become eligible for lead distribution.
- If the exact locality is unknown, offer a controlled review or fallback process rather than inventing a locality.
- Businesses must be able to edit their location later, subject to reasonable verification.
- Store the address, postcode and resolved geographical identifiers separately.
- Store the canonical identifiers for each geographical level, not just the displayed names.
- Ensure a locality can be linked to its parent town, borough, district, administrative area, region and country.
- Prevent duplicate location records caused by alternative spellings.
- Support alternative names and common locality aliases for search and matching.
- Make location selectors searchable and easy to use on mobile.
- Do not require a customer to provide a full address just to request a quote. Customer privacy must be protected.

### Distinguish business address from service coverage

A business's registered operating location is not necessarily the only place it serves.

During onboarding, allow businesses to confirm their main operating location and select any additional areas they are willing to cover.

For example, a painter based in Rush Green might serve:

- Rush Green
- Dagenham
- Becontree
- Chadwell Heath
- Barking
- Other selected nearby areas

Use a structured service-area selector based on the same geographical database.

Do not assume that every business serves every nearby area. Only match businesses to locations they have selected or that they have explicitly agreed to cover.

Support sensible parent-location coverage settings, such as serving the whole borough or town, but make the scope visible to the business and administrator.

---

## 4. BUILD A REUSABLE UK GEOGRAPHY DATABASE

The location system must support the whole of the UK and scale to thousands of towns, districts, neighbourhoods and smaller localities.

Create or extend a central geographical database with relationships such as:

- Country
- Nation or region
- County or equivalent administrative area, where applicable
- Local authority, borough or district, where applicable
- Town or city
- Locality, neighbourhood, village or suburb
- Postcode/address mapping, where licensed data permits

Use a flexible parent-child geographical model rather than hard-coding a fixed number of levels into every record.

Each location should support fields such as:

- Unique ID
- Canonical name
- Slug
- Location type
- Parent location ID
- Country ID
- Administrative identifiers where available
- Alternative names
- Active/inactive status
- Source and last verification date, where relevant

The business and lead records must reference these location IDs.

The same location dataset must power:

1. Business registration.
2. Business service-area selection.
3. Customer job-request location selection.
4. Automated lead matching.
5. Admin lead filtering.
6. Directory location pages and location-based search, where applicable.

Do not create independent, inconsistent location lists for each feature.

Before importing geographical data, inspect any existing location records and map or migrate them safely. Avoid creating duplicate records.

---

## 5. BUSINESS SERVICE CATEGORIES

Every business must select the service categories it offers using the existing directory taxonomy wherever possible.

For example:

- Plumbing
- Electrical services
- Painting and decorating
- Gardening
- Hedge trimming
- Cleaning
- Removals
- Roofing
- Locksmith services
- Handyman services
- Landscaping

Allow more than one category per business.

Use canonical category IDs rather than matching only against free-text names.

Where customers use synonyms, map them to the appropriate canonical service category. For example, a customer searching for a painter should be matched to suitable painting and decorating providers.

Do not send a lead to an unrelated business simply because it is geographically close.

---

## 6. CUSTOMER JOB REQUEST AND LEAD CREATION

Integrate the new system with the existing or planned customer enquiry form.

Capture appropriate information, such as:

- Customer name
- Email address
- Phone number
- Requested service
- Job description
- Job location
- Postcode or relevant location information
- Preferred contact time, if supplied
- Urgency or requested completion date, if relevant
- Customer consent and privacy-notice version
- Lead creation timestamp
- Lead status

Only collect information necessary to assess and fulfil the enquiry.

Resolve the customer's selected or detected location to a canonical location ID. If the customer enters a postcode, use the approved address/location service to resolve the appropriate location.

The customer must not need to understand the full geographical hierarchy.

After a valid job request is submitted:

1. Create a lead record immediately.
2. Display a clear confirmation to the customer.
3. Make the lead visible in the admin dashboard immediately.
4. Start the automated matching and assignment process.
5. Record every matching and assignment decision in the audit log.

Do not create duplicate leads when the customer double-clicks Submit, refreshes the page or retries after a network failure. Use appropriate idempotency protection.

---

## 7. AUTOMATED LOCATION-BASED LEAD MATCHING

The matching engine must consider both the exact locality and its parent locations.

This is a critical requirement.

### Example: Dagenham Dock

A customer requests a painter and decorator in Dagenham Dock.

The system should search in this order:

**Level 1: Exact locality**

Find eligible painting and decorating businesses that serve Dagenham Dock.

**Level 2: Parent town or borough**

If insufficient eligible businesses are available, search the relevant parent area, such as Dagenham or the appropriate wider borough, according to the geographical relationships in the database.

This could include an eligible painter based in Rush Green, provided that the business has agreed to serve the relevant parent area or has selected Dagenham Dock or a qualifying coverage area.

**Level 3: Wider parent administrative area**

If the lead remains unassigned, expand to an appropriate wider administrative area, such as the relevant London borough, where the business's service coverage allows it.

**Level 4: Nearby eligible areas**

If still necessary, identify nearby areas using reliable geographical relationships or coordinates. Only include businesses that have opted into those areas or an explicitly configured distance-based coverage policy.

Never assume that two places are eligible matches simply because their names sound similar or they are both in the same county.

### Matching rules

The matching engine must:

- Match the requested service category.
- Consider the customer's exact locality first.
- Expand through valid parent-location relationships when necessary.
- Respect each business's declared service coverage.
- Exclude inactive, suspended or otherwise ineligible businesses.
- Check the business's lead-credit balance before assigning a paid lead.
- Apply the two-paying-business limit defined below.
- Avoid repeatedly sending the same lead to the same business.
- Record the reason a business was included or excluded.
- Support administrator overrides.
- Never silently mark a lead as assigned when the assignment failed.

If exact-locality businesses are available, prioritise them before businesses in broader areas, subject to eligibility and the lead distribution policy.

If multiple businesses are equally eligible, use a transparent and configurable allocation method, such as round-robin distribution, rather than always favouring the same business.

The system should support a configurable minimum number of eligible recipients and a maximum of two paying recipients per lead.

---

## 8. FREE LISTINGS AND PAID LEAD CREDITS

Businesses can list in the directory for free or use existing paid listing options. Listing status and lead purchasing are separate.

Introduce a lead-credit wallet for each eligible business.

### Credit rules

- Each new eligible business receives **5 free lead credits once**.
- One lead credit costs **£1**.
- One credit is consumed when the business receives a qualifying paid lead assignment.
- A business can purchase as many credits as it wishes, subject to payment and reasonable anti-abuse controls.
- For example, 50 credits cost £50.
- The business must see its current credit balance in its dashboard.
- The business must be able to view credit transactions, purchases, usage and relevant lead history.
- A business must never receive the initial five-credit grant twice by repeatedly editing its profile or re-registering through the same account.
- Record the reason, timestamp and source of every credit movement.

Implement a secure ledger rather than storing only a number that can be edited without an audit trail.

Recommended transaction types include:

- Initial free-credit grant
- Paid credit purchase
- Lead-credit consumption
- Refund
- Administrator adjustment
- Reversal after a failed assignment or other approved exception

Use database transactions or equivalent safeguards to prevent race conditions and double deduction.

### Important distinction: free businesses versus paid lead recipients

A business may list for free and receive its initial five credits.

When those credits are exhausted, it can continue to maintain its directory listing, but it cannot receive further paid lead assignments until it purchases more credits.

Do not automatically convert a free directory listing into a paid subscription.

### Lead assignment and credit consumption

Define the point at which a credit is consumed. The recommended rule is:

- A credit is reserved or deducted when the paid assignment is successfully created.
- If the assignment fails before delivery, release the reservation or reverse the deduction.
- Do not charge twice for retries, duplicate notifications or repeated processing of the same lead.
- Do not automatically refund a lead merely because the customer does not answer the phone, unless a published lead guarantee explicitly provides for it.

Keep the policy configurable and make it clear in the business terms.

### Credit purchasing

Add a purchase interface that lets businesses select or enter the quantity of credits they want to buy.

Display a clear calculation:

- 5 credits = £5
- 10 credits = £10
- 25 credits = £25
- 50 credits = £50
- Custom quantity = quantity × £1

Use the payment provider already integrated into the platform if suitable. Otherwise, recommend and implement an appropriate payment provider after reviewing the existing architecture.

Do not store card details directly.

Only add credits after verified payment confirmation from the payment provider. Use signed webhooks, idempotency and transaction records to prevent duplicate credit grants.

Confirm applicable VAT and invoicing requirements with an accountant. Do not assume that every displayed price is VAT-inclusive or VAT-exclusive without deciding and clearly communicating the correct policy.

---

## 9. STRICT RULE: NO MORE THAN TWO PAYING BUSINESSES PER LEAD

A customer lead may be shared with **a maximum of two paying businesses**.

This is a hard business rule, not a recommendation.

The system must enforce the limit at database and application levels so that concurrent jobs cannot accidentally assign the same lead to three or more paying businesses.

Do not count a failed assignment as a successfully delivered lead if it was never made available to the business. Maintain a clear distinction between reserved, assigned, delivered, accepted, failed and cancelled states.

A business should not be charged multiple credits for the same lead unless a clearly documented and explicitly approved product rule requires it.

If two eligible paying businesses have already received the lead, do not send it to a third paying business automatically.

### Recommended distribution priority

1. Identify businesses matching the service and location.
2. Filter out ineligible businesses and businesses without sufficient credits for paid allocation.
3. Prioritise exact-locality matches.
4. Expand to eligible parent locations if necessary.
5. Select up to two paying recipients using the configured allocation policy.
6. Notify the selected businesses.
7. Update the lead record and audit trail.
8. If the lead remains unassigned, trigger the admin escalation process.

**Important decision to implement explicitly:** Free directory listings must not silently become a way to bypass the two-paying-business limit. If the business wants to send a lead to a free-mode business as an exception, that should be handled through the separate admin manual-assignment workflow described below.

---

## 10. NEW LEADS FEATURE IN THE ADMIN DASHBOARD

Create a dedicated **New Leads** feature inside the existing admin dashboard.

Administrators must be able to see every newly submitted lead as soon as it is created, regardless of whether it has been assigned to a business.

This is an administrative oversight view, not a list limited to unassigned leads.

### Lead dashboard columns

Include useful fields such as:

- Lead reference number
- Date and time received
- Requested service
- Customer's location and postcode
- Customer name
- Assignment status
- Number of eligible businesses found
- Number of paying businesses assigned
- Businesses notified
- Credit status where relevant
- Lead age
- Escalation status
- Actions

Use role-based permissions to restrict access to customer contact details.

### Admin filters

Allow filtering by:

- New or unreviewed leads
- Unassigned leads
- Partially assigned leads
- Assigned leads
- Failed assignments
- Service category
- Country, region and administrative area
- Town or borough
- Locality
- Date range
- Assignment status
- Business recipient
- Credit or payment status

### Lead detail view

Clicking a lead should display:

- Customer enquiry details
- Exact resolved location and parent hierarchy
- Matching businesses considered
- Why businesses were included or excluded
- Businesses that received the lead
- Whether notifications were sent successfully
- Credit deductions and reversals
- Assignment timestamps
- Retry attempts
- Admin notes and manual actions
- Complete audit history

Administrators must be able to monitor the lead lifecycle from submission through assignment and notification.

---

## 11. AUTOMATIC UNASSIGNED-LEAD ALERTS

If a new lead has no successful business assignment after a short configurable period, notify the administrators.

Use a default initial escalation threshold of **three minutes**, configurable in the admin settings.

Do not wait three minutes if the system has already determined that no eligible recipient exists and it can safely escalate immediately.

The alert must include:

- Lead reference
- Service requested
- Customer location
- Time received
- Reason no business was assigned
- Matching or expansion stages attempted
- Link to open the lead in the admin dashboard
- A clear call to action to assign the lead manually

Notify the configured admin recipients through the existing notification infrastructure.

Support retries and delivery-status logging. Avoid sending duplicate escalation alerts every time the matching worker retries.

Keep the lead visible in the New Leads dashboard even if email delivery fails.

---

## 12. MANUAL ADMIN ASSIGNMENT

Administrators must be able to manually assign a lead to any suitable business, including one outside the customer's exact locality.

For example, if no painter in Dagenham Dock can take a job, an administrator may choose a painter in Rush Green or another nearby location, provided the business offers the requested service and is an appropriate recipient.

### Manual assignment requirements

The admin should be able to:

1. Open an unassigned or partially assigned lead.
2. View suggested businesses ordered by service relevance, location suitability and eligibility.
3. Search for another business by name, service category or location.
4. View its operating location, declared coverage, listing status and lead-credit balance.
5. Choose whether the assignment is paid or an approved free-mode exception.
6. Review the assignment and any applicable credit consequences.
7. Confirm the assignment.
8. Trigger the business notification.
9. See the result immediately in the audit history.

Manual assignment must still respect the two-paying-business maximum unless a specifically authorised and documented exception is approved for a different commercial arrangement.

### Assigning to free-mode businesses

Admins may assign a lead to a free-mode business when necessary.

Provide a clear assignment type:

- Paid credit assignment
- Free/admin-sponsored assignment

A free/admin-sponsored assignment must not silently deduct credits from a business that has none.

Record the administrator, reason, timestamp and assignment type. If an assignment is complimentary, make it clear in the business notification that the lead was provided without a credit deduction.

Do not let free assignments become an unrestricted method of distributing paid leads to additional businesses outside the two-paying-business rule. Keep manual exceptions auditable and make the commercial policy explicit.

---

## 13. URGENT BUSINESS NOTIFICATIONS

Businesses should understand that a new job opportunity is available and that contacting the customer promptly may improve their chances of winning the work.

Send an urgent email when a lead is successfully assigned. Use the existing email service where possible.

Also consider in-app notifications and optional SMS or WhatsApp notifications if the platform supports them and the business has provided the required consent.

### Email requirements

The email should include:

- A clear, location-specific subject line.
- The requested service.
- The customer's general location.
- The job description or a suitable summary.
- The customer's contact details only when the assignment and consent rules permit sharing them.
- A prominent link or button to view the lead.
- A clear instruction to contact the customer as soon as possible.
- Any applicable credit deduction information.
- A reminder that the customer may be contacting other providers.

Use genuine urgency, not fabricated scarcity. Do not claim that the lead will expire or has been sent to only one business unless the system's actual rules support that claim.

### Suggested email subject

**New {service} lead in {local_area}: Contact the customer now**

### Suggested email copy

**A new job opportunity is available in your area.**

Hello {business_name},

A customer has just requested help with **{service_name}** in **{local_area}, {parent_location}**.

**Job details**
- Service: {service_name}
- Location: {local_area}, {parent_location}
- Job summary: {job_summary}
- Received: {lead_received_time}
- Lead reference: {lead_reference}

**Please review the enquiry and contact the customer as soon as possible.** Customers may be speaking to other local providers, so a prompt, professional response can help you secure the job.

{VIEW_LEAD_BUTTON}

Your current lead-credit balance is {credit_balance}.

{credit_deduction_notice}

Thank you,  
{platform_name}

You must adapt the template to the real lead status and available fields. Never include a fabricated job description or unavailable customer information.

### Credit deduction notice examples

For a paid assignment:

"One lead credit (£1) has been used for this assignment."

For an admin-sponsored assignment:

"This lead was assigned to you by the platform at no credit cost."

For a reserved assignment awaiting final delivery:

"Your lead credit is temporarily reserved. The final transaction status will appear in your dashboard."

Do not display contradictory notices.

---

## 14. LOW-CREDIT AND ZERO-CREDIT NOTIFICATIONS

When a business's credit balance reaches a configured low threshold, send a reminder to purchase more credits.

Use a configurable threshold, with an initial default of two credits remaining.

When the balance reaches zero:

- Keep the business's directory listing active if otherwise eligible.
- Prevent further automatic paid lead assignments.
- Display a clear zero-credit message in its dashboard.
- Send an email explaining how to purchase additional credits.
- Provide a direct link to the credit-purchasing page.
- Do not repeatedly send the same zero-credit email on every failed assignment attempt.

### Suggested subject

**Your lead credits are running low: Keep receiving local job enquiries**

### Suggested email copy

Hello {business_name},

Your lead-credit balance is now **{credit_balance}**.

Your directory listing can remain active, but you need available lead credits to receive further automatic paid lead assignments.

You can purchase additional credits at £1 each. For example, 50 credits cost £50.

{BUY_CREDITS_BUTTON}

Top up whenever you are ready to continue receiving eligible local job opportunities.

Thank you,  
{platform_name}

Send the zero-credit version when the balance reaches zero. Respect notification preferences and applicable electronic-marketing rules.

---

## 15. BUSINESS DASHBOARD: LEADS AND CREDITS

Add a **Leads** section to the existing business dashboard.

Include:

- Available lead credits
- Purchase credits action
- Credit transaction history
- New lead notifications
- Assigned lead list
- Lead reference
- Requested service
- Customer location
- Date received
- Job summary
- Assignment type
- Credit charged, if any
- Lead status
- Contact details where permitted
- Link to view the full enquiry
- Relevant contact or response action

Businesses must only see leads assigned to them and must never be able to access other businesses' leads or another business's credit balance.

Do not expose the entire admin lead database through public APIs or frontend filtering alone. Enforce access control on the server.

---

## 16. DATA MODEL AND TECHNICAL SAFEGUARDS

Adapt the existing schema instead of blindly creating duplicate tables. Document the final schema and migration plan.

The implementation will likely need equivalent records for:

- Geographical locations and parent relationships
- Business operating locations
- Business service categories
- Business service coverage
- Customer leads
- Lead assignment records
- Lead notification events
- Business credit accounts or balances
- Credit ledger transactions
- Payment orders and payment confirmations
- Admin assignment actions
- Audit logs

A lead may have multiple assignment records. Do not store all recipients in a single text field.

Use explicit states and timestamps for assignment and notification lifecycle management.

Implement:

- Server-side authentication and authorisation.
- Database constraints for the maximum of two paying recipients per lead.
- Atomic credit reservation/deduction.
- Idempotent payment webhooks.
- Idempotent lead-processing jobs.
- Retryable background notification jobs.
- Audit logs for credit and admin operations.
- Rate limiting and spam protection on customer enquiry forms.
- Validation of all submitted locations and service categories.
- Appropriate database indexes for location/category matching.
- Monitoring for failed assignments and notification errors.
- Tests for concurrent submissions and concurrent assignment attempts.

Never rely on hiding a button in the frontend as the only security control.

---

## 17. PRIVACY, CUSTOMER CONSENT AND BUSINESS TERMS

Because this platform shares customer contact details with service providers, build the consent and data-protection requirements into the product.

Before enabling live lead distribution, review the customer-facing privacy notice, consent wording, business terms and lead-credit terms with a qualified UK privacy or legal adviser.

The product must clearly explain:

- That customer enquiry details may be shared with relevant local businesses.
- The purpose of sharing the details.
- The categories or maximum number of businesses that may receive them.
- How the customer's information will be used.
- How long the information will be retained.
- How customers can exercise their applicable data-protection rights.
- Whether separate marketing consent is requested and what it covers.

Do not bundle optional marketing consent into a mandatory service enquiry without appropriate legal review.

Do not share personal data with every business listed in the directory. Only authorised recipients of that specific lead should receive the details.

Implement role-based access, retention policies, secure transport and appropriate data deletion or anonymisation procedures.

Obtain legal review of the £1 lead-credit model, cancellation/refund terms, invoicing and any applicable VAT treatment.

---

## 18. TESTING REQUIREMENTS

Before marking the feature complete, test at least the following scenarios.

### Registration and location

1. A business enters a valid postcode and selects its exact address.
2. The system correctly resolves the business's geographical hierarchy.
3. A business uses manual location selection.
4. A business cannot finish onboarding without a valid operating location.
5. A business selects a main area and additional service areas.
6. The system handles an unknown or ambiguous locality without inventing a result.
7. A business updates its location without corrupting previous lead records.

### Matching

8. A customer requests a painter in Dagenham Dock and an eligible painter serving that exact locality exists.
9. No exact-locality painter exists, but an eligible painter serves the parent Dagenham area.
10. A painter based in Rush Green is considered only when its declared coverage makes it eligible.
11. No suitable provider exists in the immediate area, but an eligible provider exists in a wider permitted service area.
12. Providers offering unrelated services are excluded.
13. Providers with zero credits are excluded from automatic paid assignments.
14. The system assigns a lead to no more than two paying businesses, even when several jobs process concurrently.
15. Reprocessing a lead does not charge the same business twice.

### Admin

16. Every new lead appears in New Leads immediately.
17. An unassigned lead triggers the configured escalation alert.
18. Admin can manually assign a suitable business from a nearby area.
19. Admin can sponsor an assignment without an unintended credit deduction.
20. Admin can inspect the full assignment and notification history.

### Credits and payments

21. A new eligible business receives exactly five credits once.
22. Assigning a paid lead consumes one credit according to the configured transaction rule.
23. A failed assignment does not leave an invalid charge.
24. A successful payment grants the correct number of credits.
25. Duplicate payment webhooks do not grant credits twice.
26. Fifty purchased credits cost £50 before any separately disclosed taxes or fees that legally apply.
27. Zero-credit businesses retain their directory listing but cannot receive further automatic paid assignments.
28. Low-credit and zero-credit emails are not sent repeatedly for the same event.

### Security and privacy

29. A business cannot access another business's lead records.
30. A business cannot alter its credit balance through a client-side request.
31. An unauthorised user cannot access admin lead details.
32. Only the appropriate lead recipients can access the customer's contact details.
33. Consent and relevant assignment audit events are recorded.

---

## 19. IMPLEMENTATION PHASES AND BATCH LIMIT

Implement this work in small, reviewable batches. **Never implement more than three landing pages in a batch**, consistent with the wider SEO project. This new feature work must also be broken into manageable code batches, and must not trigger bulk generation of location pages.

Recommended development phases:

**Phase A: Audit and architecture**
- Inspect the existing system.
- Document the schema and integration points.
- Propose migrations and dependencies.
- Do not make destructive changes.

**Phase B: Geography and business onboarding**
- Build or extend the canonical location database.
- Implement postcode/address resolution.
- Implement cascading manual location selectors.
- Require location confirmation during onboarding.
- Add service-area selection.

**Phase C: Lead creation and admin dashboard**
- Integrate job-request submission.
- Create the New Leads dashboard.
- Add lead detail views and audit history.

**Phase D: Matching and assignment**
- Implement service and location matching.
- Add parent-location expansion.
- Enforce the maximum of two paying recipients.
- Add the manual admin assignment workflow.

**Phase E: Credit wallet and payments**
- Grant five initial credits.
- Implement the transaction ledger.
- Implement credit purchasing and payment confirmation.
- Add atomic deduction and reversal rules.

**Phase F: Notifications and escalation**
- Implement urgent lead emails.
- Add low-credit and zero-credit notifications.
- Implement the three-minute unassigned-lead escalation.
- Add retry handling and delivery logs.

**Phase G: Testing and release preparation**
- Run unit, integration, security and end-to-end tests.
- Review privacy and commercial terms.
- Prepare a safe migration and rollback plan.
- Verify existing directory registration, reviews and listings remain functional.

For each batch:

1. Inspect the relevant code and dependencies.
2. Explain the intended changes.
3. Implement only the approved batch.
4. Run relevant tests.
5. Update all project documentation.
6. Record files changed, migrations, test results and unresolved issues in `BATCH_LOG.md`.
7. Report the result and stop.

Do not claim that a feature is complete when it has only been mocked up or when its backend, security, payment verification or notification logic is missing.

Do not proceed into the next batch until explicitly authorised.

---

## 20. REQUIRED FINAL DELIVERABLES

When the approved implementation phases are complete, provide:

- Updated business registration flow with mandatory location selection.
- Postcode/address lookup and manual cascading selectors.
- Reusable UK geographical hierarchy.
- Business service-area configuration.
- Customer job-request integration.
- Location-aware lead matching with parent-area expansion.
- Maximum two paying recipients enforced per lead.
- Five-credit welcome grant.
- £1-per-credit purchase flow.
- Secure credit ledger and payment verification.
- New Leads admin dashboard.
- Automatic unassigned-lead alerts.
- Manual admin assignment, including approved free-mode assignments.
- Urgent lead email templates.
- Low-credit and zero-credit notifications.
- Business lead and credit dashboard.
- Automated tests and deployment instructions.
- Database migration and rollback instructions.
- Updated project documentation and batch logs.
- A list of known limitations, external service costs and any remaining manual setup.

## 21. YOUR FIRST ACTION

**Start with Phase A only.**

Audit the existing platform and identify exactly how the current business directory, business registration, location data, admin dashboard, payment system and notification system work.

Create or update the documentation, recommend the safest implementation architecture and identify any missing information or external services required.

Do not immediately start coding all features. Do not generate landing pages. Do not overwrite working functionality. Finish Phase A, report the findings and wait for explicit approval to begin Phase B.

At the end of each authorised batch, stop and state clearly:

**BATCH COMPLETE. I HAVE STOPPED. I WILL NOT START ANOTHER BATCH UNTIL YOU EXPLICITLY AUTHORISE IT.**



NEXT:
PROJECT: UK-WIDE LOCAL SERVICES LEAD-GENERATION PLATFORM

YOUR ROLE

Act as a coordinated team of five senior website developers, each with over 20 years of experience, supported by senior specialists in technical SEO, local SEO, keyword research, UX/UI, conversion copywriting, data engineering, analytics, quality assurance, privacy, and lead generation.

Your mission is to build a UK-wide local services lead-generation platform that attracts people searching Google for local services, converts them into qualified enquiries, and sells or routes those leads to local businesses that need customers.

The website must be professionally engineered, visually impressive, fast, mobile-first, accessible, commercially effective, and built for sustainable organic search growth.

This is a long-term project that may eventually cover 50 local service industries and tens of thousands of service-location opportunities.

Do not treat this as a generic website or bulk content-generation project. Treat it as a serious, scalable commercial platform.

==================================================
1. BUSINESS MODEL AND PRIMARY OBJECTIVE
==================================================

The business model is:

1. A customer searches Google for a local service.
2. The customer discovers our relevant service and location landing page.
3. The page answers their specific need and persuades them to enquire.
4. The customer submits their name, email, phone number, location, and job requirements.
5. The platform validates and qualifies the enquiry.
6. The platform matches the enquiry with suitable local service providers.
7. The lead is sold or routed to providers under transparent commercial terms.
8. The platform records whether the lead was accepted, contacted, converted into a booking, or rejected.

The principal objective is not simply to generate website traffic.

The objective is to generate qualified, commercially valuable leads that local businesses are willing to pay for.

Every decision must support one or more of these goals:

- Relevant organic search visibility.
- Useful content that genuinely answers local customer needs.
- High landing-page conversion rates.
- Reliable lead capture and delivery.
- Strong provider demand and retention.
- Sustainable revenue and profit.
- Long-term website quality and search visibility.

Never guarantee that a page will rank number one. Build a system that maximises the opportunity to rank through evidence, relevance, quality, technical excellence, and continuous improvement.

==================================================
2. READ THE EXISTING PROJECT AND MASTER PLAN FIRST
==================================================

Before coding or generating landing pages:

1. Inspect the existing repository, framework, architecture, routing, CMS, database, design system, deployment process, analytics, and form handling.
2. Locate and read the document named:

   UK_Local_Services_Lead_Generation_SEO_Master_Plan.docx

   If the document is not available in the repository, ask me to provide it. Do not pretend you have read a document you cannot access.

3. Inspect all existing project documentation.
4. Preserve useful existing work.
5. Identify missing requirements, dependencies, risks, and architectural decisions.
6. Create or update the project documentation described below.
7. Produce the overall implementation plan before creating landing pages.

Do not replace the existing technology stack without a clear technical reason.

Do not delete, overwrite, or refactor unrelated functionality unnecessarily.

If you encounter a material architectural decision that could significantly affect cost, security, maintainability, or future scalability, document the options and ask me before proceeding.

==================================================
3. MANDATORY THREE-PAGE BATCH LIMIT
==================================================

THIS IS THE MOST IMPORTANT EXECUTION RULE.

NEVER CREATE, PUBLISH, OR SUBSTANTIALLY REVISE MORE THAN THREE LANDING PAGES IN A SINGLE AUTHORISED BATCH.

The absolute maximum is THREE landing pages per batch.

This restriction applies regardless of how many pages are in the queue, how easy the pages appear to generate, or how much work remains.

For example:

If we are working on gardeners in Becontree and have identified three approved, distinct landing-page opportunities, you may build those three pages.

After completing them, you MUST STOP.

You must not proceed to another service, another location, another three pages, or another batch until I explicitly authorise continuation.

After each batch:

1. Complete the selected pages.
2. Run the required quality checks.
3. Save all work.
4. Update the project plan.
5. Update the page queue.
6. Update the progress log.
7. Record the completed URLs and keyword targets.
8. Report the results to me.
9. Recommend the next three pages without creating them.
10. STOP and wait for my instruction.

Do not automatically continue in the background.

Do not use scripts, bulk imports, automated loops, hidden routes, background jobs, or other mechanisms to bypass this restriction.

Building reusable components, research tools, database schemas, and project documentation does not count as creating a landing page. However, you must never use this exception to generate additional landing pages outside the authorised batch.

If I say "continue", "next batch", or provide another clear instruction to continue, you may start the next batch of up to three pages.

That instruction authorises ONLY the next batch.

You must stop again after that batch.

If fewer than three approved pages remain, create only the remaining approved pages.

==================================================
4. CREATE AND MAINTAIN THESE PROJECT DOCUMENTS
==================================================

Create the following documents in the project's documentation directory.

Use existing equivalents if they already exist, updating them rather than creating unnecessary duplicates.

A. MASTER_PLAN.md

Must contain:

- Overall business vision.
- Revenue model.
- Customer acquisition strategy.
- Local SEO strategy.
- Lead qualification and distribution model.
- Technical architecture.
- Geographic coverage strategy.
- Service prioritisation.
- Conversion strategy.
- Risks and dependencies.
- Success metrics.
- Current phase and next milestones.

B. PHASES.md

Break the project into clear implementation phases.

For every phase, document:

- Objectives.
- Prerequisites.
- Tasks.
- Dependencies.
- Expected outputs.
- Testing requirements.
- Completion criteria.
- Risks.
- Approval requirements.

C. PROJECT_TODO.md

Maintain a detailed, prioritised task list.

Mark tasks as:

- Not started.
- In progress.
- Blocked.
- Awaiting approval.
- Completed.
- Requires revision.

Never mark a task complete unless it has actually been completed and verified.

D. SERVICE_RANKING.md

Document the 50 local service categories, their provisional ranking, demand evidence, commercial value, competition, regulatory considerations, confidence level, and research date.

E. GEOGRAPHY_SCHEMA.md

Document how the system represents England's geographic hierarchy, including locations, aliases, neighbourhoods, boundaries, sources, and relationships.

F. LOCATION_MASTER.csv

Maintain the verified geographic database.

G. KEYWORD_DATABASE.csv

Maintain all researched keywords, their sources, intent, demand estimates, commercial value, selected landing pages, and status.

H. PAGE_QUEUE.csv

Maintain the complete backlog of proposed landing pages.

I. TECHNICAL_SEO_CHECKLIST.md

Document technical SEO requirements, tests, and outstanding problems.

J. LEAD_ROUTING_AND_PRIVACY.md

Document lead capture, qualification, provider matching, consent, data handling, privacy, retention, and commercial rules.

K. BATCH_LOG.md

Record every authorised batch, its pages, tests, results, decisions, and next steps.

L. SEO_EXPERIMENTS.md

Record SEO experiments, hypotheses, changes, dates, results, and follow-up actions.

M. CONTENT_BRIEFS/

Create a content brief for each approved landing page before writing its final copy.

All these documents must remain consistent with one another.

==================================================
5. RESEARCH AND RANK THE TOP 50 LOCAL SERVICES
==================================================

Research the strongest local service categories in the UK.

Start with this provisional list:

1. Plumbers and emergency plumbing.
2. Electricians.
3. Locksmiths and emergency lock services.
4. Removals and home moving.
5. Roofers and roof repairs.
6. Heating engineers and boiler services.
7. Builders and general building work.
8. Domestic cleaners and house cleaning.
9. Gardeners and garden maintenance.
10. Landscapers and garden design.
11. Painters and decorators.
12. Handymen and property maintenance.
13. Carpenters and joiners.
14. Plasterers and renderers.
15. Tilers and tile fitting.
16. Bathroom fitters and bathroom renovations.
17. Kitchen fitters and kitchen renovations.
18. Driveway and patio installers.
19. Fencing and gate installers.
20. Rubbish removal and house clearance.
21. Skip hire and waste services.
22. Carpet and upholstery cleaning.
23. End-of-tenancy cleaning.
24. Window cleaners.
25. Pest control.
26. Damp proofing and mould treatment.
27. Glaziers and window repairs.
28. Double glazing and door installers.
29. Garage door repair and installation.
30. Appliance repair.
31. Boiler installation and renewable heating.
32. Air conditioning and ventilation.
33. Solar panel and battery installers.
34. EV charger installation.
35. Insulation and energy-efficiency services.
36. Flooring installers.
37. Carpet fitters.
38. Office and commercial cleaning.
39. Commercial removals and office relocation.
40. Man-and-van services.
41. Mobile mechanics and vehicle repair.
42. Car recovery and breakdown recovery.
43. Car body repair and mobile dent repair.
44. Mobile tyre fitting.
45. Dog grooming.
46. Dog walking and pet sitting.
47. Hairdressers and barbers.
48. Beauty therapists and nail technicians.
49. Physiotherapy and sports massage.
50. Solicitors and local legal services.

IMPORTANT:

This is an initial list, not a verified final ranking.

Do not simply accept the order without investigation.

Use credible sources and current research to determine which categories deserve priority.

Use tools and sources such as:

- Google Keyword Planner.
- Google Trends.
- Google search results.
- Competitor keyword research.
- Search Console data once available.
- Industry reports.
- Local service marketplaces.
- Reliable industry-specific search-demand studies.
- Actual lead conversion and sales data once the platform is operating.

For each service category, investigate:

- Search demand.
- High-intent search demand.
- Local competition.
- Potential lead value.
- Customer urgency.
- Average job value where credible data is available.
- Recurring customer demand.
- Provider availability.
- Likelihood that local businesses will purchase leads.
- Seasonality.
- Conversion potential.
- Regulatory requirements.
- Liability and operational risk.

Distinguish between search demand, marketplace job volume, advertising demand, and actual willingness to purchase leads.

These are not interchangeable measures.

Record sources, dates, methodology, assumptions, and confidence levels.

Never invent keyword volumes, conversion rates, CPC figures, or market statistics.

Re-rank the categories when evidence supports doing so.

==================================================
6. BUILD A DETAILED GEOGRAPHIC DATABASE FOR ENGLAND
==================================================

The platform must not restrict location coverage to major towns or cities.

It must investigate and represent smaller villages, neighbourhoods, suburbs, housing estates, localities, and recognised areas within larger towns and cities.

The system should eventually support every suitable serviceable locality in England.

Do not rely on the AI model's memory alone to build the location database.

Use verified sources, including:

- Office for National Statistics geography datasets.
- Ordnance Survey Open Names and appropriate OpenData products, subject to their licence terms.
- Local authority geographic information.
- Credible local sources for neighbourhood and estate names.
- Other authoritative datasets where legally accessible.

Respect source licensing, attribution, privacy, and usage restrictions.

The geographic model should support:

- Regions.
- Counties and equivalent geographic areas.
- Local authorities and districts.
- Cities.
- Towns.
- Villages.
- Suburbs.
- Neighbourhoods.
- Housing estates.
- Named localities.
- Alternative place names.
- Spelling variants.
- Overlapping geographic areas.
- Places sharing the same name.

A place may relate to multiple administrative or functional areas. Do not force every place into a simplistic single-parent hierarchy.

For every location record, store as appropriate:

- Stable location ID.
- Canonical name.
- Alternative names.
- Place type.
- Parent location.
- Local authority.
- County or equivalent area.
- Region.
- Source.
- Source date.
- Confidence level.
- Evidence notes.
- Coordinates or boundary references from valid sources.
- Service coverage status.
- Duplicate detection status.
- Whether a distinct landing page is justified.
- Reason for creating or rejecting that page.

EXAMPLE: NEWBURY AND SURROUNDING AREAS

Investigate smaller locations such as:

- Wash Common.
- Speen.
- Donnington.
- Thatcham.

Verify the place names, relationships, and serviceable coverage.

EXAMPLE: DAGENHAM

Investigate smaller areas including:

- Becontree.
- Chadwell Heath.
- Rush Green.
- Becontree Heath.
- Marks Gate.
- Dagenham Dock.
- Castle Green.
- Dagenham Green.
- Beam Park.

Verify each location and its relationship to Dagenham and surrounding areas.

Do not assume that every name is an officially defined neighbourhood or that every boundary is universally agreed.

The same research process must be applied across England.

Do not stop at the first level of towns and villages.

Investigate deeper geographic levels where credible sources support them.

Do not invent locations, boundaries, neighbourhood names, local landmarks, or local facts.

Do not create multiple records for the same locality merely because it has alternative spellings.

Do not create a landing page for a location unless the service can genuinely be offered there and the page can provide useful information.

==================================================
7. RESEARCH THE THREE STRONGEST KEYWORD OPPORTUNITIES
==================================================

For every approved service and location combination, research the strongest keyword opportunities.

Do not simply generate three phrases by adding the location name to generic keywords.

Research the actual customer intent.

For a gardening service in Becontree, investigate possibilities such as:

- Gardeners Becontree.
- Hedge trimming Becontree.
- Garden maintenance Becontree.
- Garden clearance Becontree.
- Local gardeners in Becontree.
- Gardeners near me, where relevant to the research.

These are examples, not verified keyword rankings.

Use keyword research to determine which terms have real demand and which pages would satisfy the searcher's intent.

For every candidate keyword, record:

- Exact search phrase.
- Service.
- Location.
- Search intent.
- Search-volume estimate.
- Source and research date.
- Geographic targeting settings.
- Commercial intent.
- Competition estimate.
- Relevant competitors.
- Search-result intent.
- Expected lead value.
- Confidence.
- Proposed URL.
- Whether a separate page is justified.

Never fabricate search volume or pretend that a keyword is the most searched phrase without evidence.

If data is unavailable, label the keyword as an unverified hypothesis.

IMPORTANT KEYWORD RULE:

Three keyword phrases do not automatically mean three separate landing pages.

For example:

- Plumber in Thatcham.
- Plumbers Thatcham.
- Local plumber Thatcham.

These phrases may represent the same search intent.

They should generally be considered for one strong landing page rather than three pages competing with each other.

However:

- Emergency plumbing in Thatcham.
- Boiler repair in Thatcham.
- Bathroom plumbing installation in Thatcham.

These may justify separate pages if research establishes distinct search intent, demand, service availability, and sufficient useful content.

The goal is to identify the three strongest keyword opportunities, then determine the correct number of pages needed to serve those intents.

Do not manufacture separate pages just to meet a numerical target.

==================================================
8. PREVENT KEYWORD CANNIBALISATION
==================================================

Maintain a master keyword-to-URL map.

Before creating a page:

1. Search the existing page database.
2. Identify existing pages targeting the same keyword or intent.
3. Check whether a relevant page already exists.
4. Determine whether the new opportunity should be handled by an existing page, a revised page, a new page, or no page.
5. Record the decision.

Do not create multiple pages that compete for the same search intent.

Do not create one page for every trivial keyword variation.

Do not create separate pages solely for:

- Singular versus plural variations.
- Slight changes in word order.
- Minor synonyms.
- Repeated phrases with the same intent.
- Alternative spellings of the same location.

Where several related terms belong to the same intent, use them naturally on the strongest appropriate page.

==================================================
9. CREATE CONVERSION-FOCUSED LANDING PAGES
==================================================

Every approved page must be carefully designed and written for its particular service, locality, and customer intent.

The website should feel like a professionally designed lead-generation product, not a collection of automatically generated SEO pages.

Use a reusable, well-engineered design system.

However, the content and presentation must respond to the actual service, location, search intent, customer concerns, and available evidence.

Aim for genuinely original content rather than mechanically changing words.

Shared navigation, form components, legal notices, and standard design elements may appropriately remain consistent.

Do not force meaningless design differences simply to make pages appear different.

Every page must include the following where relevant:

A. SEARCH-ALIGNED HEADLINE

The headline must immediately communicate the service and location.

It must address the actual customer need rather than merely repeat keywords.

B. COMPELLING OPENING COPY

The first section must quickly answer:

- What service is being offered?
- Is the service available in the customer's area?
- What problem can the service help address?
- What should the customer do next?

C. CLEAR VALUE PROPOSITION

Explain what happens when the visitor submits an enquiry.

Do not claim that a service provider has been found, contacted, or booked unless that is actually true.

D. RELEVANT SERVICE INFORMATION

Explain the specific work that customers can request.

Include relevant examples, options, considerations, limitations, and next steps.

E. LOCATION-SPECIFIC INFORMATION

Include verified local coverage and genuinely useful local context where available.

Do not invent local facts or add meaningless paragraphs merely to repeat a location name.

F. CUSTOMER OBJECTIONS

Address real questions and concerns, such as:

- How does the enquiry process work?
- What information should I provide?
- What affects the cost?
- How quickly might a provider respond?
- What happens if no suitable provider is available?
- Will my contact information be shared?

Only make promises that the platform can fulfil.

G. TRUST ELEMENTS

Use real, verifiable information.

Never invent testimonials, reviews, accreditations, provider relationships, job statistics, or customer success stories.

H. INTERNAL LINKS

Link to useful related services, parent locations, child locations, and relevant guides.

Ensure the pages are discoverable through a logical website structure.

I. SEARCH METADATA

Create unique, accurate:

- Title tags.
- Meta descriptions.
- H1 headings.
- Relevant subheadings.
- Canonical URLs.
- Image alt text where appropriate.

Do not keyword-stuff these elements.

J. STRONG CALL TO ACTION

The CTA must be visible, specific, persuasive, and appropriate to the service.

Examples include:

- Tell Us About Your Job.
- Request a Local Quote.
- Get Help With Your Plumbing Problem.
- Find a Suitable Local Service Provider.

Choose the CTA based on the real customer journey.

Do not claim to provide an instant quote if the platform only collects an enquiry.

==================================================
10. APPLY DIRECT-RESPONSE MARKETING PRINCIPLES
==================================================

Study the general marketing principles associated with:

- Gary Halbert.
- Eugene Schwartz.
- Claude C. Hopkins.
- Joseph Sugarman.
- John Caples.
- Dan Kennedy.
- John Henry Patterson.
- Joe Girard.
- Mary Kay Ash.
- Zig Ziglar.
- David Ogilvy.
- Steve Jobs.
- Seth Godin.
- Joanna Wiebe.
- Sabri Suby.

Apply principles such as:

- Understanding customer awareness.
- Matching copy to the customer's intent.
- Strong and specific headlines.
- Clear benefits.
- Relevant proof.
- Compelling offers.
- Reduced friction.
- Addressing objections.
- Clear next steps.
- Trust.
- Ethical persuasion.
- Measurable conversion improvement.

Create original copy.

Do not imitate any living writer's exact style or reproduce copyrighted passages.

The copy should sound natural, confident, helpful, commercially effective, and relevant to the real customer.

Avoid generic AI language, exaggerated promises, empty superlatives, and repetitive filler.

The objective is to make it easy for the right customer to understand the offer and take the next step.

==================================================
11. LEAD CAPTURE AND QUALIFICATION
==================================================

The principal lead form should collect only the information needed to handle the enquiry.

Core fields:

- Name.
- Email address.
- Phone number.
- Postcode or locality.
- Service required.
- Short description of the job.

Optional fields may include:

- Urgency.
- Preferred appointment date.
- Property type.
- Relevant job details.
- Preferred contact method.

Keep the form straightforward and mobile-friendly.

Explain which fields are required and why.

Validate the submitted data.

Implement appropriate protection against spam, duplicate submissions, and malicious input.

The platform must clearly explain:

- Who operates the website.
- What happens after a form is submitted.
- Whether the enquiry may be shared with one or multiple providers.
- How contact details may be used.
- How to access the privacy notice.
- How users can exercise their applicable data rights.

Do not pre-tick optional marketing consent.

Do not sell or share personal information without an appropriate lawful basis and transparent disclosures.

Implement secure data storage, access controls, retention rules, deletion procedures, and appropriate audit logging.

Review applicable UK GDPR, PECR, and other legal requirements with qualified advisers before launch.

Do not claim legal compliance without appropriate verification.

==================================================
12. PROVIDER MATCHING AND LEAD MONETISATION
==================================================

Design the platform so that qualified leads can be matched with legitimate local providers.

Provider matching must consider:

- Service category.
- Actual service coverage.
- Locality and postcode.
- Provider eligibility.
- Relevant qualifications where required.
- Capacity.
- Availability.
- Lead purchase arrangements.
- Provider performance.
- Customer requirements.

Never invent a provider or imply that a provider has accepted a job when they have not.

Develop a documented lead lifecycle:

1. Submitted.
2. Validated.
3. Spam and duplicate checks completed.
4. Qualified.
5. Matched.
6. Offered to provider.
7. Accepted or rejected.
8. Contact attempted.
9. Booking outcome recorded.
10. Commercial outcome recorded.

Define:

- What qualifies as a saleable lead.
- How duplicate leads are handled.
- How invalid leads are treated.
- Refund and dispute procedures.
- Provider pricing.
- Provider reporting.
- Lead distribution rules.
- Customer complaints handling.

The business must eventually be able to measure revenue and profit per lead.

==================================================
13. TECHNICAL SEO REQUIREMENTS
==================================================

Inspect the current architecture and implement or document the following:

- Crawlable, stable URLs.
- Logical service and location hierarchies.
- Internal linking.
- XML sitemaps.
- Canonical tags.
- Robots directives.
- Appropriate noindex controls.
- Redirect handling.
- Mobile responsiveness.
- Page performance.
- Accessibility.
- Structured data where accurate and appropriate.
- Search Console integration.
- Analytics.
- Conversion tracking.
- Error monitoring.
- Form-delivery monitoring.
- Indexation monitoring.

Do not automatically index every generated page.

Pages must pass quality review before becoming indexable.

Ensure that sitemap files contain only appropriate canonical URLs that should be indexed.

Prevent duplicate URLs and accidental indexing of internal search results, empty templates, filters, drafts, and low-value pages.

Use structured data only when the information is accurate and the page is eligible.

Do not create fake business addresses or misleading Google Business Profiles.

==================================================
14. GOOGLE SPAM-POLICY SAFEGUARDS
==================================================

Read the current Google Search Central spam policies.

Pay particular attention to scaled content abuse and doorway abuse.

The platform must not publish thousands of pages that differ only by changing the service or location name.

Each indexed landing page must provide substantial, useful value for its intended search.

If there is insufficient evidence or information to make a page genuinely useful:

- Do not publish it.
- Do not index it.
- Consider merging the intent into a stronger page.
- Record the decision and explain why.

Do not create pages primarily to manipulate rankings.

Do not generate fake local reviews, fake local jobs, false business claims, invented landmarks, fake addresses, or unsupported guarantees.

Do not claim a provider is local unless that claim is accurate.

Do not use misleading location content to capture visitors who cannot receive the service.

The project must prioritise useful coverage, not the largest possible number of URLs.

==================================================
15. PROJECT IMPLEMENTATION PHASES
==================================================

PHASE 0: PROJECT AUDIT AND REQUIREMENTS

Inspect the existing project, identify the current architecture, review the business requirements, identify risks, and document the implementation approach.

PHASE 1: MARKET AND KEYWORD RESEARCH

Research the 50 service categories, identify credible evidence, develop a scoring methodology, and document the provisional ranking.

PHASE 2: GEOGRAPHIC DATABASE

Design and implement the location schema, source inventory, geographic hierarchy, alias handling, and validation process.

PHASE 3: TECHNICAL ARCHITECTURE AND DESIGN SYSTEM

Plan the database, routes, content model, landing-page components, lead forms, analytics, provider matching, and SEO controls.

PHASE 4: CONTENT AND PAGE QUEUE

Build the keyword database, identify genuine page opportunities, resolve keyword overlap, and create the prioritised page queue.

PHASE 5: CONTROLLED PILOT

Select up to three approved landing pages.

Build them, test them, and verify that the complete enquiry journey works.

PHASE 6: LEAD OPERATIONS AND MEASUREMENT

Verify form delivery, provider matching, lead qualification, analytics, privacy controls, and commercial reporting.

PHASE 7: PILOT REVIEW

Evaluate search visibility, user behaviour, enquiry quality, conversion, provider demand, and revenue potential.

Correct problems before expansion.

PHASE 8: CONTROLLED EXPANSION

Continue building pages in batches of no more than three, with explicit owner authorisation between batches.

PHASE 9: CONTINUOUS IMPROVEMENT

Monitor search performance, update outdated information, improve conversions, consolidate competing pages, and expand based on verified demand.

Do not silently skip phases.

If a dependency is missing, document it and ask for a decision where necessary.

==================================================
16. PAGE QUEUE AND STATUS TRACKING
==================================================

Every proposed page must have a unique record in PAGE_QUEUE.csv.

Include fields such as:

- Page ID.
- Service category.
- Canonical location.
- Parent location.
- Primary keyword.
- Supporting keyword intents.
- Research source.
- Search-demand evidence.
- Commercial priority.
- Proposed URL.
- Existing competing URL.
- Page type.
- Unique local information required.
- Content brief status.
- Build status.
- QA status.
- Publication status.
- Indexation status.
- Lead performance.
- Last reviewed date.
- Decision notes.

Use statuses such as:

PLANNED
RESEARCHING
RESEARCH_COMPLETE
AWAITING_APPROVAL
BRIEF_READY
IN_PROGRESS
BUILT
QA_PASSED
APPROVED
PUBLISHED
INDEXED
NEEDS_REVISION
CONSOLIDATE
REJECTED
RETIRED

Keep the page queue accurate.

Do not mark pages as published or indexed without verification.

Do not claim that a page is ranking when ranking data has not been checked.

==================================================
17. MANDATORY PROCEDURE FOR EACH BATCH
==================================================

BEFORE STARTING:

1. Read MASTER_PLAN.md.
2. Read PHASES.md.
3. Read PROJECT_TODO.md.
4. Read PAGE_QUEUE.csv.
5. Read BATCH_LOG.md.
6. Check the current project state.
7. Select no more than three approved page records.
8. Verify keyword intent and local evidence.
9. Check for existing competing pages.
10. Prepare or update the content briefs.

DURING THE BATCH:

1. Build only the approved pages.
2. Use the existing design system where appropriate.
3. Produce original, evidence-backed content.
4. Implement the CTA and form correctly.
5. Ensure the pages work on mobile and desktop.
6. Add the appropriate metadata and internal links.
7. Keep all page statuses accurate.
8. Do not publish automatically unless publishing has been authorised.

AFTER THE BATCH:

1. Check page content and factual accuracy.
2. Check that no local facts have been invented.
3. Check keyword targeting and cannibalisation.
4. Test all internal and external links.
5. Test all forms and validation.
6. Check responsive layouts.
7. Check accessibility basics.
8. Check metadata and canonical URLs.
9. Check robots and indexation settings.
10. Check sitemap eligibility.
11. Check analytics events.
12. Check lead storage and routing.
13. Record test results.
14. Save all changes.
15. Update all relevant project documentation.
16. Update PAGE_QUEUE.csv.
17. Update PROJECT_TODO.md.
18. Update BATCH_LOG.md.
19. Provide the batch report.
20. STOP.

Do not create another landing page after this point.

==================================================
18. REQUIRED REPORT AFTER EVERY BATCH
==================================================

Your final report must contain:

BATCH NUMBER AND DATE

PAGES CREATED OR REVISED

For each page, provide:

- Service.
- Location.
- URL.
- Primary keyword intent.
- Supporting keyword intents.
- Research evidence.
- Why the page deserves to exist separately.
- What makes its content useful and distinct.
- CTA.
- Lead form behaviour.
- QA status.
- Publication and indexation status.

FILES UPDATED

List the actual project documents and files changed.

TEST RESULTS

List the tests performed and any failures.

OPEN ISSUES

Explain unresolved problems and decisions needed.

NEXT THREE RECOMMENDED PAGES

Recommend the next three opportunities based on evidence and commercial priority.

Do not create those next pages.

END THE REPORT WITH THIS EXACT MESSAGE:

"BATCH COMPLETE. I HAVE STOPPED. I WILL NOT START ANOTHER BATCH UNTIL YOU EXPLICITLY AUTHORISE IT."

==================================================
19. SUCCESS METRICS
==================================================

Track:

SEO:
- Impressions.
- Clicks.
- Click-through rate.
- Search queries.
- Ranking trends.
- Indexed pages.
- Indexation errors.
- Organic traffic.

CONVERSION:
- Landing-page conversion rate.
- Form-start rate.
- Form-completion rate.
- Valid enquiry rate.
- Phone-call clicks where tracked.

LEAD QUALITY:
- Duplicate rate.
- Spam rate.
- Contactability.
- Serviceability.
- Provider acceptance.
- Booking rate.
- Lead rejection rate.

COMMERCIAL:
- Revenue per lead.
- Gross margin per lead.
- Provider retention.
- Repeat lead purchases.
- Refund and dispute rate.
- Cost of acquiring a qualified lead.

QUALITY:
- Percentage of pages passing QA.
- Pages with verified local information.
- Pages with search intent overlap.
- Thin-page rate.
- User complaints.
- Privacy requests.
- Form-delivery failures.

Use the results to improve the service ranking and page queue.

Do not confuse more indexed pages with more revenue.

==================================================
20. FIRST TASK: PLAN AND PREPARE, DO NOT BUILD LANDING PAGES
==================================================

Your first assignment is to inspect the project and establish the plan.

Do not create any service-location landing pages during this initial planning task.

First:

1. Inspect the repository and existing documentation.
2. Read the master planning document.
3. Identify the current technical architecture.
4. Create or update the project documentation.
5. Establish the service research methodology.
6. Establish the geographic data model.
7. Establish the keyword research methodology.
8. Establish the page queue and batch tracking system.
9. Identify technical, SEO, operational, and privacy risks.
10. Create the phase plan and prioritised task list.


Once the planning documents are ready, present the proposed approach and wait for my approval before building the first landing pages.

==================================================
FINAL OPERATING PRINCIPLE
==================================================

Build a trustworthy, technically excellent, commercially effective UK local-services lead-generation platform.

Use research to choose the right opportunities.

Use geography data to represent real local areas.

Use keyword research to understand real search intent.

Use excellent design and persuasive, original copy to convert relevant visitors.

Use technical SEO and useful content to maximise sustainable organic search visibility.

Use reliable provider matching and transparent lead handling to generate revenue.

Never sacrifice quality, accuracy, or customer trust merely to create more pages.

NEVER CREATE MORE THAN THREE LANDING PAGES IN A SINGLE AUTHORISED BATCH.

AFTER EVERY BATCH, SAVE THE WORK, UPDATE THE DOCUMENTATION, REPORT THE RESULTS, AND STOP UNTIL I AUTHORISE THE NEXT BATCH.


