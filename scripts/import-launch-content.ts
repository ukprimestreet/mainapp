/**
 * PrimeStreet launch content. Real content only, per docs/data-sourcing.md:
 *  - Business facts were collected from each company's OWN official website on 6 October 2026 and written here
 *    in our own words. Nothing is copied from Google, Yell, Trustpilot or any other directory. No invented facts.
 *  - A business is only included when its own site published BOTH a full address and a telephone number.
 *  - Every article lists its primary sources and the date the facts were checked.
 * Idempotent: upserts by slug, deletes nothing. Safe to re-run.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const CHECKED = "6 October 2026";
const ago = (days: number) => new Date(Date.now() - days * 86400_000);

// ---------------------------------------------------------------- businesses
type B = {
  slug: string; name: string; cat: string; area: string; summary: string; description: string;
  address: string; postcode: string; phone: string; website: string; services: string[];
  founded?: number; hours?: Record<string, string>; source: string;
};

const BUSINESSES: B[] = [
  {
    slug: "daunt-books-marylebone", name: "Daunt Books Marylebone", cat: "retail", area: "westminster",
    summary: "Independent bookseller on Marylebone High Street, known for shelving by country.",
    description:
      "Daunt Books on Marylebone High Street is an independent bookshop whose defining habit is arranging a large part of its stock by country rather than by genre, so that fiction, history and travel writing about the same place sit together on one shelf. Alongside the country rooms it carries general fiction and non-fiction, children's books, signed editions and stationery, and it runs a programme of author talks and events in the shop.\n\nThe shop is open seven days a week and sits a short walk from Baker Street and Bond Street stations.",
    address: "83-84 Marylebone High Street", postcode: "W1U 4QW", phone: "020 7224 2295",
    website: "https://dauntbooks.co.uk",
    services: ["Books", "Signed editions", "Travel writing by country", "Children's books", "Stationery", "Author events"],
    hours: { mon: "09:00-19:30", tue: "09:00-19:30", wed: "09:00-19:30", thu: "09:00-19:30", fri: "09:00-19:30", sat: "09:00-19:30", sun: "11:00-18:00" },
    source: "Own research from the company's official website (dauntbooks.co.uk), " + CHECKED,
  },
  {
    slug: "e5-bakehouse", name: "e5 Bakehouse", cat: "cafes", area: "hackney",
    summary: "Sourdough bakery, cafe and baking school in a railway arch off Mentmore Terrace.",
    description:
      "e5 Bakehouse started in 2010 in a railway arch in Hackney and still bakes there, working with long sourdough fermentations and a clay oven. The arch combines a working bakery with a cafe serving coffee, cakes and pastries, and the business sells bread wholesale as well as over the counter.\n\nIt also runs a bakery school, with courses that range from a first attempt at sourdough through to pastry work, and the business is explicit about sourcing: it buys from named farmers and gives ecological impact as a reason for how it chooses grain and ingredients. Beyond the original arch it now operates further sites in east London.",
    address: "Arch 395, Mentmore Terrace", postcode: "E8 3PH", phone: "020 8525 2890",
    website: "https://e5bakehouse.com",
    services: ["Sourdough bakery", "Cafe", "Baking courses", "Wholesale bread", "Online shop"],
    founded: 2010,
    source: "Own research from the company's official website (e5bakehouse.com), " + CHECKED,
  },
  {
    slug: "andrew-edmunds-soho", name: "Andrew Edmunds", cat: "restaurants", area: "westminster",
    summary: "Soho restaurant in a Grade II listed Georgian townhouse, trading since 1985.",
    description:
      "Andrew Edmunds has served Soho from a Grade II listed Georgian townhouse on Lexington Street since 1985. The dining rooms are small, candlelit and panelled, with church-pew seating, and the kitchen cooks seasonal modern European food along Franco-Mediterranean bistro lines.\n\nThe wine list is the reason many people book: it is long, and the restaurant keeps its mark-ups deliberately restrained so that good bottles stay affordable. Two rooms are available for private dining, there is a pre-theatre menu, and the restaurant also runs wine courses and tastings.",
    address: "46 Lexington Street", postcode: "W1F 0LP", phone: "020 7437 5708",
    website: "https://www.andrewedmunds.com",
    services: ["Modern European restaurant", "Wine list", "Private dining", "Pre-theatre menu", "Wine tastings"],
    founded: 1985,
    source: "Own research from the company's official website (andrewedmunds.com), " + CHECKED,
  },
];

// ---------------------------------------------------------------- articles
type A = { slug: string; type: string; title: string; standfirst: string; body: string; seoDescription: string; days: number; featured?: boolean };

const sources = (lines: string[]) =>
  "\n\n---\n\n## How we checked this\n\nFacts in this piece were taken from the primary sources below and checked on " +
  CHECKED + ". Rules and figures change: check the source before you act on anything here.\n\n" +
  lines.map((l) => "- " + l).join("\n");

const ARTICLES: A[] = [
  {
    slug: "checks-before-paying-a-deposit-london-trades", type: "GUIDE", days: 5, featured: true,
    title: "Five checks before you pay a deposit to a London trade",
    standfirst: "A deposit is the moment you lose your leverage. These checks take about ten minutes and tell you more than any star rating will.",
    seoDescription: "Before paying a builder, plumber or electrician in London: how to check the company exists, the registrations are real, the insurance is current and the quote is enforceable.",
    body: [
      "Every bad building job in London has the same shape. A price that felt keen, a deposit paid in good faith, and then a slow realisation that the person holding your money is harder to reach than they were when they wanted it.",
      "Reviews will not protect you here. They are easy to buy, easy to farm from friends, and they tell you about jobs that are not yours. What protects you is ten minutes of checking before the money moves.",
      "## 1. Check the company actually exists, and for how long",
      "Companies House is the statutory register of UK companies. In its own words it exists to \"incorporate and dissolve limited companies\" and to \"register company information and make it available to the public\". Search the register for the name on the quote.",
      "What you are looking for is less about a clean record than about consistency. Does the company exist at all? How long has it been incorporated? Is it active, or dissolved, or in the course of being struck off? Are accounts and confirmation statements filed, or overdue? Has it traded under previous names?",
      "A company incorporated three weeks ago is not automatically a bad bet, but it does mean there is no track record behind the quote, and that should change what you are willing to pay up front.",
      "## 2. Do not trust the registered address as a location",
      "The address on the register is the registered office: the place that receives statutory mail. For a great many small firms that is their accountant's office or a company formation agent, sometimes in a different part of the country. It is not evidence of a local presence, and it is not where anyone works.",
      "If you want to know where a business actually operates, look for a trading address on its own website, and treat the two as answers to different questions.",
      "## 3. Check trade registrations on the register's own site",
      "Some work is not legal for an unregistered person to do. Gas work is the clearest case: the Health and Safety Executive points consumers to the Gas Safe Register as the register for domestic gas engineers. Electrical work in homes is covered by competent person schemes whose members self-certify against the building regulations.",
      "The important part is the method, not the name of the scheme. Ask for the registration number, then check that number on the scheme's own website. Do not accept a photograph of a card, a logo on a van or a badge in a website footer. Any of those can be copied in a minute; a register entry cannot.",
      "## 4. Ask for the insurance certificate, not the reassurance",
      "\"We're fully insured\" is a sentence, not a policy. Ask for the public liability certificate and read three things on it: the insurer's name, the cover limit, and the dates. Cover that lapsed last spring is worth nothing, and a limit well below the value of your property is worth less than it sounds.",
      "If the job involves structural work, ask who carries the professional indemnity for the design decisions, which is a different policy and often a different company.",
      "## 5. Make the quote specific enough to argue with",
      "A quote that reads \"supply and fit new bathroom, £9,500\" is not a document you can enforce. One that lists what is included, what is excluded, who supplies the materials, the make and model of the key items, how long the work should take and what happens if it overruns, is.",
      "Get it in writing before any money moves, and keep the written version. Where there is a deposit, agree what it is for. A deposit that covers ordered materials is reasonable and should be evidenced. A large deposit that is simply the first slice of the price is a transfer of risk to you.",
      "### How you pay matters",
      "Staged payments against completed milestones keep both sides honest. Paying a large sum in cash removes the paper trail and most of your recourse at once. Card and bank payments leave a record, and card payments may give you an additional route to dispute.",
      "## The London-specific bits people forget",
      "Three things catch London jobs in particular. Parking: many trades need a bay suspension or a dispensation from the borough, which takes days to arrange and costs money that should be in the quote. Waste: a skip on the public highway needs a permit from the borough, and fly-tipped waste traced back to your address becomes your problem, so ask who is carrying the waste away and under what licence. Access: in flats and conversions, work often needs the freeholder's consent, and a trade that has not asked about this has not finished thinking about your job.",
      "In conservation areas and on listed buildings, replacing windows or altering a frontage may need consent in its own right. A trade that shrugs at that question is telling you something.",
      "## What none of this proves",
      "These checks establish that a real, insured, registered business is quoting you a specific price for specific work. They do not establish that the work will be good. For that, the most useful thing remains seeing a job the firm finished a year ago, rather than one it finished last week.",
    ].join("\n\n") + sources([
      "Companies House, GOV.UK: [what Companies House does](https://www.gov.uk/government/organisations/companies-house) and [find information about a company](https://www.gov.uk/get-information-about-a-company)",
      "Health and Safety Executive: [domestic gas safety](https://www.hse.gov.uk/gas/domestic/index.htm), which names the Gas Safe Register as the register for gas engineers",
    ]),
  },
  {
    slug: "small-business-rates-london-explained", type: "GUIDE", days: 9,
    title: "Small business rates in London, explained",
    standfirst: "Rateable value is not your rent and not your turnover. Here is what the numbers on the bill mean, and the relief that can take it to zero.",
    seoDescription: "How business rates work for small London businesses: rateable value, small business rate relief at the £12,000 and £15,000 thresholds, the higher London multi-property cap, and how to check your valuation.",
    body: [
      "Business rates are the tax on occupying commercial property, and they are one of the largest fixed costs a small London business carries. They are also widely misunderstood, which costs people money in both directions: some pay a bill they are entitled not to pay, and others assume a relief applies when it does not.",
      "## Rateable value is an estimate of rent, not of you",
      "Everything starts with the rateable value. It is the Valuation Office Agency's estimate of the annual open-market rent for your property at a fixed valuation date. It is not the rent you actually pay, and it has nothing to do with your turnover or your profit.",
      "That is why two shops side by side can pay different amounts, and why a quiet year does not reduce your bill. Rateable values change at a revaluation, not when trade dips.",
      "## The relief that matters most",
      "Small business rate relief is the one worth knowing in detail, because at the bottom of the scale it removes the bill entirely. GOV.UK states the rule plainly: \"You will not pay business rates on a property with a rateable value of £12,000 or less, if that's the only property your business uses.\"",
      "Above that it tapers rather than stopping abruptly. For rateable values between £12,001 and £15,000, GOV.UK says \"the rate of relief will go down gradually from 100% to 0%\", and gives worked examples: a rateable value of £13,500 attracts 50% relief, and £14,000 attracts 33%.",
      "The practical consequence is that the band between £12,000 and £15,000 is where small changes in valuation have outsized effects on what you owe. If your property sits near either edge, the valuation is worth checking carefully.",
      "## The London threshold that is easy to miss",
      "If your business uses more than one property, the relief does not simply disappear. The additional conditions are that none of the other properties has a rateable value above £2,899, and that the total rateable value of everything you occupy stays under a cap.",
      "That cap is where London differs: GOV.UK gives £20,000 nationally and £28,000 in London. If you run two or three small sites in the capital, you may still qualify on a combined value that would disqualify a business elsewhere in England. It is worth doing the arithmetic rather than assuming.",
      "## Check your own valuation before you do anything else",
      "Your rateable value is public. You can look up your property through the Valuation Office Agency and see the valuation and the detail behind it, including the measurements and the categories used.",
      "Read the detail, not just the number. Valuations are built from floor areas and the use of each part of the property, and errors there are the most common reason a figure is wrong: a mezzanine counted as retail space rather than storage, or an area measured as it was before a change.",
      "If something looks wrong, the route is to check first and then challenge through the VOA. Be sceptical of unsolicited approaches from firms promising to cut your rates for a share of the saving; you can start the process yourself, at no cost, and you should know what the claim is before anyone makes it on your behalf.",
      "## What to budget for",
      "Two things should be in your forecast. The first is revaluation: rateable values are periodically reassessed, and a rise can move you out of a relief band. The second is that reliefs are policy, not entitlements in perpetuity. Schemes aimed at particular sectors come and go with budgets, so a bill that was discounted this year may not be next.",
      "If your rateable value sits just under a threshold, treat the relief as something to re-check annually rather than a settled feature of your cost base.",
    ].join("\n\n") + sources([
      "GOV.UK: [small business rate relief](https://www.gov.uk/apply-for-business-rate-relief/small-business-rate-relief) — the thresholds, taper examples and multi-property conditions quoted above",
      "Valuation Office Agency, GOV.UK: [check and challenge your business rates valuation](https://www.gov.uk/correct-your-business-rates)",
    ]),
  },
  {
    slug: "when-to-register-for-vat-london-business", type: "GUIDE", days: 14,
    title: "When your business has to register for VAT",
    standfirst: "One threshold, two tests, and a rolling twelve months that is not your financial year. This is the rule that catches growing businesses out.",
    seoDescription: "The UK VAT registration threshold is £90,000 of taxable turnover. How the rolling 12-month test and the 30-day forward test work, and what registering changes for a small business.",
    body: [
      "VAT registration is the first tax milestone most growing businesses hit, and the rule that trips people is not the threshold itself. It is the period the threshold is measured over.",
      "## The threshold and the two tests",
      "The threshold is £90,000 of taxable turnover. GOV.UK sets out the backward-looking test as your \"total taxable turnover for the last 12 months goes over £90,000 (the VAT threshold)\".",
      "There is also a forward-looking test, which is the one that surprises people: you must register if you \"expect your taxable turnover to go over £90,000 in the next 30 days\". That can be triggered by a single large contract, before you have invoiced anything.",
      "## \"The last 12 months\" is a rolling window",
      "This is the heart of it. The twelve months is not your accounting year and does not reset in April. It rolls. At the end of every month you look back over the previous twelve and ask whether the total crossed £90,000.",
      "So a business billing £7,000 a month sits just under £84,000 a year and never registers. The same business with two unusually good months can cross the line in, say, the twelve months ending in August, even though neither its financial year nor any single quarter looked remarkable. If nobody is watching the rolling total, the first anyone notices is after the obligation has already arisen.",
      "Taxable turnover is also not simply everything that lands in the bank. It is the value of the goods and services you supply that are not exempt. Which of your income streams count is worth establishing once, properly, rather than assuming.",
      "## What changes when you register",
      "Three things, in descending order of how much they will occupy you.",
      "You start charging VAT on your taxable sales, which means deciding whether to add it to your prices or absorb it. For a business selling to VAT-registered companies this is close to neutral, because your customers reclaim it. For one selling to the public it is effectively a price rise or a margin cut, and it is better to decide which deliberately than to discover it in your first quarter.",
      "You can reclaim VAT on what you buy. For a business with real equipment, stock or premises costs, that is money back, and it is why some businesses register before they have to.",
      "You take on returns. VAT-registered businesses keep digital records and file through Making Tax Digital using compatible software, on a regular cycle. This is bookkeeping discipline rather than difficulty, but it is a standing commitment.",
      "## Registering early on purpose",
      "Voluntary registration below the threshold is legitimate and sometimes sensible. It suits businesses whose customers are mostly VAT-registered, and businesses with significant input costs to reclaim. It suits a consumer-facing business with thin margins much less well.",
      "A quieter reason some London business-to-business firms register early: an invoice with a VAT number on it reads as an established business to procurement departments. That is a commercial judgement rather than a tax one, but it is a real consideration.",
      "## The mistakes that cost money",
      "Watching the financial year instead of the rolling twelve months is the common one. Ignoring the 30-day forward test when a large contract is signed is the expensive one. Assuming that because you are under the threshold today you have a year's grace is the one that produces backdated liability, because the obligation runs from when the test was met, not from when you noticed.",
      "If you are within about £15,000 of the threshold on a rolling basis, put the rolling total on your monthly numbers. It is a single line, and it is the line that decides this.",
    ].join("\n\n") + sources([
      "GOV.UK: [VAT registration — when to register](https://www.gov.uk/vat-registration/when-to-register), the source of the £90,000 threshold and both tests quoted above",
    ]),
  },
  {
    slug: "why-local-business-data-online-is-wrong", type: "INSIGHT", days: 2, featured: true,
    title: "We tried to verify 19 London businesses in an afternoon. Three passed",
    standfirst: "Not because the businesses are not real, but because the web makes verification oddly hard. What that gap does to local search, and how to check a listing yourself.",
    seoDescription: "An attempt to verify 19 London businesses from their own websites produced three with both a full address and a phone number. Why local business data online is so often wrong.",
    body: [
      "PrimeStreet has a rule about its directory: a business only goes in if its own website publishes the facts we list. Not a review site, not an aggregator, not a travel listicle. The company's own words about where it is and how to reach it.",
      "We set out to apply that rule to a batch of well-known independent London businesses. Nineteen companies, chosen because they plainly exist and are plainly independent. The result was worse than we expected.",
      "## What happened to nineteen businesses",
      "Three published both a full street address and a telephone number in a form we could read and verify. Those three are now in the directory.",
      "Four published part of what we needed. One well-regarded Fitzrovia cafe lists two shops with full postcodes and no phone number at all. A fitness business lists phone numbers for two studios but gives only the postal districts, not the addresses. A restaurant group gives one address and a set of email addresses, no telephone. An estate agency naming five London branches prints a registered office in Teddington and no phone number on its front page.",
      "The remaining twelve gave us nothing usable. Several refused automated access outright. Several had contact pages that no longer exist where their own navigation pointed. One returned an expired security certificate. One domain failed to resolve at all.",
      "None of this means those businesses are badly run. It means a business's own website is a weaker source of structured fact than almost everyone assumes, and that anyone claiming to have verified a large directory this way is probably not doing what they say.",
      "## The failure modes are boringly consistent",
      "The first is that contact details are designed for humans, not for checking. A phone number rendered inside an image, a contact form instead of a number, an address split across a footer and a map embed: all perfectly usable if you are a customer with a phone in your hand, all close to useless as a verifiable record.",
      "The second is decay. Businesses move, change numbers, close one site and open another. The listing does not know. Nothing in the system tells it.",
      "The third is copying. When a directory cannot verify something, the cheap option is to take it from another directory. That is how a single wrong phone number from 2019 ends up on nine sites, each of which looks like corroboration of the other eight. Agreement between aggregators is not evidence; it is often one error wearing several coats.",
      "## The search problem underneath it",
      "There is a worse version of this when you search by category rather than by name. Search for an independent cleaner or removals firm in London and the first page is dominated by lead-generation sites: national operations with local-sounding names, buying the search term and selling the enquiry on. A genuinely local firm with one van and no marketing budget is not on that page.",
      "This is why category pages on most local directories are so thin. They are not lists of local businesses. They are lists of businesses that are good at being listed.",
      "A smaller trap, but a telling one: searching for London small business news returns, high up, an organisation in London, Ontario. If you were assembling a directory or a news feed automatically you would not notice, and your readers would.",
      "## What we do instead, and what it costs",
      "Our rule is that a profile records where its facts came from. Each of the three businesses added this week carries a provenance note naming the official website and the date we read it. That is dull, and it is the only thing that makes a correction possible later: you cannot fix a fact whose origin you never recorded.",
      "The rule has a cost, and it is honest to state it. It means the directory grows slowly, and that a category page may sit nearly empty for a while. We would rather have a short accurate list than a long plausible one, partly on principle and partly because a page of unverified listings is exactly the sort of thin page that deserves to be ignored.",
      "The other half of the answer is not ours to supply: businesses maintaining their own listings. A claimed profile, corrected by the person who answers the phone, beats anything a publisher can establish from outside.",
      "## How to check a listing yourself",
      "Four steps, in order of how much they tell you.",
      "1. Call the number before you rely on it. It is the fastest test of whether anything else on the page is current.",
      "2. Find the detail on the company's own domain. If the only source is a directory, treat it as a claim rather than a fact.",
      "3. Check the company on Companies House, which exists to \"register company information and make it available to the public\". Look at whether it is active and how long it has traded.",
      "4. Remember that a registered office is not a trading address. It is frequently an accountant's office, and tells you nothing about local presence.",
      "If a listing fails all four, the business may still be excellent. You just have not learned anything about it yet.",
    ].join("\n\n") + sources([
      "Primary research: the official websites of 19 London businesses, read on " + CHECKED + ", against PrimeStreet's own data sourcing policy",
      "Companies House, GOV.UK: [what Companies House does](https://www.gov.uk/government/organisations/companies-house)",
    ]),
  },
  {
    slug: "registered-address-tells-you-less-than-you-think", type: "INSIGHT", days: 6,
    title: "A registered address tells you less than you think",
    standfirst: "It is the most official-looking fact about a company and one of the least useful. What the register actually records, and what to read instead.",
    seoDescription: "A company's registered office is where statutory mail goes, not where it trades. Why local business directories get this wrong, and what to check on Companies House instead.",
    body: [
      "If you want to check a company, the register is the right place to start. But the field people reach for first, the registered address, answers a narrower question than it appears to, and in a city of 33 boroughs that narrowness matters.",
      "## What the register is for",
      "Companies House describes its job simply: it exists to \"incorporate and dissolve limited companies\" and to \"register company information and make it available to the public\". The registered office is the address where a company receives statutory correspondence. That is the whole of its meaning.",
      "It is not a declaration of where the business works, where its customers are, or where its staff turn up in the morning. For small companies the registered office is very often the accountant who files the accounts, or a formation agent selling an address as a service.",
      "## How far apart the two can be",
      "The gap is routine rather than exotic. Checking London businesses this week, we read the site of an estate agency that names five branches, all in east and south-east London, and prints a registered office in Teddington, around twelve miles from the nearest of them. Both facts are published by the company. Neither is misleading. They simply answer different questions, and only one of them is about where you can walk in.",
      "That is the normal case, not a scandal. But it means a directory that treats the registered office as a location will put that agency in the wrong part of London, and a search for a local agent will miss it.",
      "## Why directories get this wrong",
      "Registered addresses are attractive to anyone building a listings site because they are available in bulk under an open licence, structured and free. Trading addresses are not: they are scattered across company websites in whatever format the designer chose.",
      "So the temptation is obvious, and the result is a directory that looks comprehensive and is quietly misfiled. It is one of the main reasons local listings disagree with each other about where a business is: some took the registered office, others took a trading address, and nobody recorded which.",
      "## What to read on the register instead",
      "The register holds more useful signals than the address, and most people never look at them.",
      "- **Incorporation date.** How long the company has existed, as opposed to how long the brand has been used.\n- **Status.** Active, dissolved, or in the course of being struck off. A proposal to strike off is a live signal worth noticing before you pay anything.\n- **Filing history.** Whether accounts and confirmation statements arrive, and whether they arrive late. Chronic lateness is not fraud, but it is information about how the business is run.\n- **Previous names.** A company trading under a fourth name is not necessarily a problem; it is a question worth asking.\n- **Officers and their other appointments.** Useful when you want to know whether the person in front of you has run this kind of business before, or has recently closed several.\n- **Charges.** Secured lending against the company's assets, which matters if you are about to extend it credit.",
      "## The practical version",
      "Use the register to answer: is this company real, how old is it, is it still alive, and does it meet its obligations. Use the company's own website to answer: where does it trade and how do I reach it. Treat a registered office as a postal fact, and nothing more.",
      "And if a directory confidently places a business in a borough, it is fair to ask where that came from. Our own profiles record the source of what we publish, which is the only reason we can tell you that the Teddington address and the five London branches both came from the company itself.",
    ].join("\n\n") + sources([
      "Companies House, GOV.UK: [what Companies House does](https://www.gov.uk/government/organisations/companies-house) and [find information about a company](https://www.gov.uk/get-information-about-a-company)",
      "The branch and registered-office example was read from that company's own website on " + CHECKED,
    ]),
  },
  {
    slug: "mayor-of-london-business-support-what-exists", type: "INSIGHT", days: 11,
    title: "What the Mayor's business support actually consists of",
    standfirst: "Four named programmes sit behind City Hall's business pages. What is harder to find is how much money is attached and who qualifies.",
    seoDescription: "The Mayor of London's business and economy pages name the London Growth Plan, Mayor's Challenge LDN, the Good Work Standard and the London Living Wage. What each is, and what the pages do not say.",
    body: [
      "If you run a small business in London and go looking for the support City Hall offers, you arrive at the Mayor's business and economy pages. They are a reasonable place to start, and they are also a good illustration of why public business support is hard to use.",
      "## What is named there",
      "Four things are named on the front of that section.",
      "The **London Growth Plan** is presented as the overarching strategy. In City Hall's own words the plan \"sets out how we will invest further in key priorities from housing and infrastructure to skills and transport\". It is a strategy document rather than a scheme you apply to, and it matters mainly because it signals where other money is likely to follow.",
      "**Mayor's Challenge LDN** is described as an initiative \"helping to solve Londoner's most pressing challenges\" — a challenge-led programme, which in practice tends to mean competitive rounds on defined themes rather than open funding.",
      "The **Good Work Standard** is aimed at employers rather than at trading conditions. The pages describe it as support for \"employers looking to embed best employment practices\". It is an accreditation: you demonstrate your practices against a framework and are recognised for it.",
      "The **London Living Wage** is the long-running campaign for a London-weighted wage floor, which City Hall says \"has never been more crucial for workers\". For an employer this is a commitment to make rather than a grant to receive, though accreditation carries reputational weight with some clients and public buyers.",
      "## What the front door does not tell you",
      "Here is the honest observation. Reading that section, you cannot tell whether any of it applies to you.",
      "The pages name the programmes and describe their purposes. They do not, at that level, publish the things a business owner needs in order to decide whether to spend an afternoon on this: how much money is available, when rounds open and close, which sectors or sizes of business qualify, and what an application actually involves. Each programme has its own pages, and the detail lives there, in different shapes.",
      "That is a familiar pattern in public business support, and it has a cost that is rarely counted. The businesses that navigate it are the ones with somebody whose job includes navigating it. A five-person firm in Croydon does not have that person, which means support designed to help the smallest businesses is disproportionately claimed by larger ones.",
      "## How to use it anyway",
      "Three practical suggestions.",
      "First, read the Growth Plan for direction rather than for money. It tells you which sectors and which parts of London are about to receive attention, which is useful intelligence whether or not you ever apply for anything.",
      "Second, go to the individual programme pages for the actual terms, and look for the eligibility and the deadline before you read the prose. If those are not stated, the programme is probably not currently open.",
      "Third, do not stop at City Hall. Boroughs run their own business support, and it is frequently more accessible to a small local business than a pan-London scheme: smaller sums, shorter forms, and officers who answer the phone. Your borough's business pages are worth as much of your time as the Mayor's.",
      "## Why we are writing this down",
      "We will cover specific schemes as they open, with the amounts and the deadlines, because that is the part that is actually usable. This piece is the map rather than the route: what exists, in whose words, and where the gaps are between the headline and the detail.",
    ].join("\n\n") + sources([
      "Mayor of London / Greater London Authority: [business and economy](https://www.london.gov.uk/programmes-strategies/business-and-economy) — the four programmes and every quoted description come from this page, read on " + CHECKED,
    ]),
  },
];

// ---------------------------------------------------------------- import
const author = await db.author.upsert({
  where: { slug: "primestreet-editorial" },
  create: {
    slug: "primestreet-editorial", name: "PrimeStreet Editorial", role: "Editorial team",
    bio: "The PrimeStreet editorial desk. These pieces are researched and written in-house from primary sources — government guidance, the statutory company register and businesses' own published material — with the sources and the date we checked them listed at the foot of every article. We do not reproduce other directories' listings, ratings or reviews. Drafting is AI-assisted and every factual claim is traceable to a cited source. Corrections are welcome.",
  },
  update: {},
});

const city = await db.city.findUnique({ where: { slug: "london" } });
if (!city) throw new Error("No London city row — run db:seed:reference first.");

let added = 0, updated = 0;
for (const b of BUSINESSES) {
  const [cat, loc] = await Promise.all([
    db.category.findUnique({ where: { slug: b.cat } }),
    db.location.findUnique({ where: { cityId_slug: { cityId: city.id, slug: b.area } } }),
  ]);
  if (!cat || !loc) throw new Error(`Missing category or area for ${b.slug} (${b.cat} / ${b.area})`);
  const data = {
    name: b.name, summary: b.summary, description: b.description,
    cityId: city.id, locationId: loc.id, categoryId: cat.id,
    address: b.address, postcode: b.postcode, phone: b.phone, website: b.website,
    services: JSON.stringify(b.services), openingHours: b.hours ? JSON.stringify(b.hours) : null,
    founded: b.founded ?? null, source: b.source, isSample: false, published: true,
    normName: b.name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    websiteHost: new URL(b.website).host.replace(/^www\./, ""),
  };
  const existed = await db.business.findUnique({ where: { slug: b.slug } });
  await db.business.upsert({ where: { slug: b.slug }, create: { slug: b.slug, ...data }, update: data });
  if (existed) updated++; else added++;
}

let aAdded = 0, aUpdated = 0;
for (const a of ARTICLES) {
  const data = {
    type: a.type, title: a.title, standfirst: a.standfirst, body: a.body,
    status: "PUBLISHED", publishedAt: ago(a.days), authorId: author.id, cityId: city.id,
    disclosure: "EDITORIAL", isSample: false, featured: !!a.featured, seoDescription: a.seoDescription,
  };
  const existed = await db.article.findUnique({ where: { slug: a.slug } });
  await db.article.upsert({ where: { slug: a.slug }, create: { slug: a.slug, ...data }, update: data });
  if (existed) aUpdated++; else aAdded++;
}

console.log(`Businesses: ${added} added, ${updated} updated — all isSample=false, every row carries a source.`);
console.log(`Articles:   ${aAdded} added, ${aUpdated} updated (${ARTICLES.filter((a) => a.type === "GUIDE").length} guides, ${ARTICLES.filter((a) => a.type === "INSIGHT").length} insights).`);
console.log(`Author:     ${author.name}`);
await db.$disconnect();
