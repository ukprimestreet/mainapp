import { SITE } from "../constants";
import type { MailPurpose } from "../mail";
import type { Block, EmailDoc } from "./layout";
import type { MailKind } from "./consent";

/**
 * The business programme: every email PrimeStreet sends to a business, from "you are listed and don't know it"
 * through to winning them back after they cancel.
 *
 * Two rules run through all of it, and they are the product, not a constraint:
 *  1. Money never buys trust. No email may suggest that paying improves a rating, a review, search order or
 *     editorial coverage, because it does not. What Premium sells is room to show more of yourself.
 *  2. Earned prompts only. We ask for money off the back of something that actually happened to them —
 *     enquiries received, views, a busy category — never invented urgency or a fake deadline.
 */
const link = (p: string) => `${SITE.url}${p}`;

export type BizTemplate<D = Record<string, unknown>> = {
  id: string;
  purpose: MailPurpose;
  kind: MailKind;
  name: string;
  about: string;
  /** What fires it. Documented here so the programme is readable in one place. */
  trigger: string;
  /** What it is for commercially. */
  goal: string;
  to: "owner" | "prospect";
  subject: (d: D) => string;
  build: (d: D) => Omit<EmailDoc, "purpose">;
  sample: D;
};

const t = <D,>(x: BizTemplate<D>) => x as unknown as BizTemplate;
const INTEGRITY = "Paying for anything on PrimeStreet never changes your rating, your reviews, where you appear in search, or whether we write about you.";

export const BUSINESS_TEMPLATES: BizTemplate[] = [
  // ============================================================ 1. Acquisition: they don't know they're listed
  t<{ business: string; area: string; category: string; views: number; claimUrl: string; profileUrl: string }>({
    id: "biz-claim-invite", purpose: "claims", kind: "lifecycle", to: "prospect",
    name: "Your business is on PrimeStreet",
    about: "Tells a business its listing exists and invites them to claim it.",
    trigger: "An unclaimed profile has been live 7+ days and has had real profile views.",
    goal: "Turn a listing into a claimed account. This is the top of the whole funnel.",
    subject: (d) => `${d.business} is listed on PrimeStreet — is this you?`,
    sample: { business: "e5 Bakehouse", area: "Hackney", category: "Cafés", views: 143, claimUrl: link("/claim"), profileUrl: link("/businesses/london/cafes/e5-bakehouse") },
    build: (d) => ({
      preheader: `${d.views} people looked at your profile this month. Claim it and you control what they see.`,
      blocks: [
        { t: "lead", text: `${d.business} has a profile on PrimeStreet, and people are finding it.` },
        { t: "stat", value: String(d.views), label: `views in the last 30 days · ${d.category} in ${d.area}` },
        { t: "p", text: "We built the listing from public information, so it is marked unclaimed: it has not been checked or approved by you. Claiming it is free and takes a couple of minutes." },
        { t: "h", text: "What claiming gets you" },
        { t: "list", items: [
          "Correct your opening hours, phone number, address and services",
          "Add photos and describe what you actually do",
          "Reply publicly to reviews",
          "See how many people viewed you and clicked through",
        ] },
        { t: "button", label: "Claim this profile — free", href: d.claimUrl },
        { t: "secondary", label: "See the profile first", href: d.profileUrl },
        { t: "p", small: true, muted: true, text: "If this is not your business, ignore this email and nothing happens. If the listing is wrong or you would rather it came down, tell us and we will sort it." },
      ],
    }),
  }),

  t<{ business: string; claimUrl: string; views: number }>({
    id: "biz-claim-reminder", purpose: "claims", kind: "lifecycle", to: "prospect",
    name: "Claim reminder (one only)",
    about: "A single follow-up. If they ignore this one, we stop.",
    trigger: "14 days after the claim invitation, still unclaimed, no reply.",
    goal: "Recover claims from people who meant to and forgot.",
    subject: (d) => `Still unclaimed: ${d.business}`,
    sample: { business: "e5 Bakehouse", claimUrl: link("/claim"), views: 198 },
    build: (d) => ({
      preheader: "Last note about this — your profile is still unclaimed.",
      blocks: [
        { t: "lead", text: `${d.business} is still showing as unclaimed on PrimeStreet.` },
        { t: "p", text: `Another ${d.views} people have looked at it since we wrote. Unclaimed profiles carry a note saying the business has not checked the details, which is not the first impression most people want.` },
        { t: "button", label: "Claim it now", href: d.claimUrl },
        { t: "p", small: true, muted: true, text: "This is the last email we will send about claiming. We will not chase you again." },
      ],
    }),
  }),

  // ============================================================ 2. Onboarding: they claimed, now make it stick
  t<{ name: string; business: string; percent: number; missing: string[] }>({
    id: "biz-profile-incomplete", purpose: "claims", kind: "lifecycle", to: "owner",
    name: "Finish your profile",
    about: "A claimed profile that is still thin.",
    trigger: "3 days after a claim is approved and the profile is under 70% complete.",
    goal: "A complete profile converts far better later. This is the groundwork for every paid product.",
    subject: (d) => `${d.business}: ${d.percent}% of your profile is done`,
    sample: { name: "Ben", business: "e5 Bakehouse", percent: 55, missing: ["Photos", "Opening hours", "Services you offer"] },
    build: (d) => ({
      preheader: "A few minutes now, and you will show up properly.",
      blocks: [
        { t: "lead", text: `${d.name}, ${d.business} is live — but it is only part finished.` },
        { t: "stat", value: `${d.percent}%`, label: "profile complete" },
        { t: "h", text: "Still missing" },
        { t: "list", items: d.missing },
        { t: "p", text: "Profiles with photos and full opening hours get noticeably more clicks through to the website and the phone. It costs nothing to finish." },
        { t: "button", label: "Finish my profile", href: link("/owner") },
      ],
    }),
  }),

  t<{ business: string; rating: number; title: string; body: string; replyUrl: string; days: number }>({
    id: "biz-review-unanswered", purpose: "reviews", kind: "lifecycle", to: "owner",
    name: "Review waiting for a reply",
    about: "A published review the business has not answered.",
    trigger: "A published review has had no reply for 7 days.",
    goal: "Replies make owners active users, and active users buy.",
    subject: (d) => `${d.business}: a review is waiting for your reply`,
    sample: { business: "e5 Bakehouse", rating: 3, title: "Good bread, tight seating", body: "The rye is excellent but there is nowhere to sit at weekends.", replyUrl: link("/owner"), days: 7 },
    build: (d) => ({
      preheader: "A public reply is the most useful thing you can do here.",
      blocks: [
        { t: "lead", text: `A ${d.rating}-star review of ${d.business} has been waiting ${d.days} days for a reply.` },
        { t: "quote", text: d.body, cite: d.title },
        { t: "p", text: "Readers take a thoughtful reply as a sign that someone is paying attention — often more than the star rating itself. A reply to a fair criticism lands better than silence." },
        { t: "button", label: "Reply to this review", href: d.replyUrl },
        { t: "p", small: true, muted: true, text: "We never remove or reorder reviews, and nobody can pay us to. If this one breaks our guidelines, report it and an editor will look." },
      ],
    }),
  }),

  t<{ business: string; url: string }>({
    id: "biz-first-review", purpose: "reviews", kind: "lifecycle", to: "owner",
    name: "Your first review",
    about: "A milestone worth marking.",
    trigger: "The first review on a claimed profile is published.",
    goal: "Reinforce the habit early.",
    subject: (d) => `${d.business} has its first review`,
    sample: { business: "e5 Bakehouse", url: link("/owner") },
    build: (d) => ({
      preheader: "Someone took the time to write about you.",
      blocks: [
        { t: "note", tone: "good", title: "First review", text: `${d.business} has its first published review.` },
        { t: "p", text: "A customer took the time to write about you, and an editor has checked it. Reply publicly — it is the best use of two minutes you have today." },
        { t: "button", label: "Read it and reply", href: d.url },
      ],
    }),
  }),

  // ============================================================ 3. Engagement: give them a reason to come back
  t<{ business: string; month: string; views: number; clicks: number; enquiries: number; reviews: number; url: string }>({
    id: "biz-monthly-report", purpose: "alerts", kind: "lifecycle", to: "owner",
    name: "Monthly performance report",
    about: "What happened on their profile last month.",
    trigger: "First working day of each month, for every claimed profile with activity.",
    goal: "The habit-forming email. It also supplies the evidence every upgrade prompt later leans on.",
    subject: (d) => `${d.business}: your ${d.month}`,
    sample: { business: "e5 Bakehouse", month: "September", views: 412, clicks: 63, enquiries: 7, reviews: 2, url: link("/owner") },
    build: (d) => ({
      preheader: `${d.views} views, ${d.clicks} clicks and ${d.enquiries} enquiries.`,
      blocks: [
        { t: "lead", text: `How ${d.business} did in ${d.month}.` },
        { t: "facts", rows: [
          ["Profile views", String(d.views)],
          ["Clicks to your website and phone", String(d.clicks)],
          ["Enquiries", String(d.enquiries)],
          ["New reviews", String(d.reviews)],
        ] },
        { t: "p", text: "These are real people who found you through PrimeStreet. Nothing here is estimated." },
        { t: "button", label: "See the detail", href: d.url },
      ],
    }),
  }),

  t<{ business: string; views: number; lastMonth: number; url: string }>({
    id: "biz-quiet-month", purpose: "alerts", kind: "lifecycle", to: "owner",
    name: "Quieter than usual",
    about: "Views dropped against the previous month.",
    trigger: "Monthly views fall by 30% or more, and the profile is incomplete.",
    goal: "Prompt a profile fix. Honest diagnosis, not a scare.",
    subject: (d) => `${d.business} was quieter in the last month`,
    sample: { business: "e5 Bakehouse", views: 180, lastMonth: 412, url: link("/owner") },
    build: (d) => ({
      preheader: "What usually explains a drop like this.",
      blocks: [
        { t: "lead", text: `${d.business} had ${d.views} views last month, down from ${d.lastMonth}.` },
        { t: "p", text: "Months vary, and one quiet month is often nothing. But two things reliably hold a profile back, and both are free to fix:" },
        { t: "list", numbered: true, items: [
          "No photos. People scroll past profiles with nothing to look at.",
          "Missing or wrong opening hours. People searching now want somewhere open now.",
        ] },
        { t: "button", label: "Check my profile", href: d.url },
        { t: "p", small: true, muted: true, text: "We are not going to pretend paying us fixes this. It would not." },
      ],
    }),
  }),

  // ============================================================ 4. Conversion: earned, never invented
  t<{ business: string; enquiries: number; month: string; price: string; url: string }>({
    id: "biz-premium-offer", purpose: "billing", kind: "marketing", to: "owner",
    name: "Premium, prompted by real demand",
    about: "Offers Premium off the back of enquiries they actually received.",
    trigger: "A claimed profile received 5+ enquiries or 250+ views in a month and is not on Premium.",
    goal: "The main subscription conversion. Earned by their own numbers.",
    subject: (d) => `${d.business} had ${d.enquiries} enquiries in ${d.month}`,
    sample: { business: "e5 Bakehouse", enquiries: 9, month: "September", price: "£29 a month + VAT", url: link("/owner") },
    build: (d) => ({
      preheader: "People are already looking for you. Premium lets you show them more.",
      blocks: [
        { t: "lead", text: `${d.enquiries} people contacted ${d.business} through PrimeStreet in ${d.month}.` },
        { t: "p", text: "That is demand you already have. Premium does not create more of it by magic — it gives you more room to convert the people who are already looking." },
        { t: "h", text: "What Premium adds" },
        { t: "list", items: [
          "A photo gallery on your profile",
          "An offer banner for whatever you are pushing this month",
          "An enquiry form, with every lead emailed straight to you",
          "Click analytics: website, phone and directions",
        ] },
        { t: "facts", rows: [["Price", d.price], ["Commitment", "Monthly. Cancel whenever you like."]] },
        { t: "button", label: "See Premium", href: d.url },
        { t: "note", tone: "info", title: "What it does not do", text: INTEGRITY },
      ],
    }),
  }),

  t<{ business: string; category: string; area: string; searches: number; price: string; url: string }>({
    id: "biz-featured-offer", purpose: "billing", kind: "marketing", to: "owner",
    name: "Featured placement offer",
    about: "Offers a labelled featured slot when their category is busy.",
    trigger: "Their category and area had high search volume and a featured slot is free.",
    goal: "One-off revenue, and it suits businesses who will not take a subscription.",
    subject: (d) => `${d.searches} people searched for ${d.category} in ${d.area} last month`,
    sample: { business: "e5 Bakehouse", category: "cafés", area: "Hackney", searches: 640, price: "£49 for 30 days + VAT", url: link("/advertise") },
    build: (d) => ({
      preheader: "A labelled slot at the top of that page.",
      blocks: [
        { t: "stat", value: String(d.searches), label: `searches for ${d.category} in ${d.area} last month` },
        { t: "p", text: `A featured placement puts ${d.business} in a slot at the top of those pages for 30 days. It is clearly labelled "Sponsored", because readers deserve to know, and because a slot that pretends to be editorial is worth less to you anyway.` },
        { t: "facts", rows: [["Price", d.price], ["Where", `${d.category} and ${d.area} pages`], ["Label", "Sponsored — always"]] },
        { t: "button", label: "Book a featured slot", href: d.url },
        { t: "note", tone: "info", title: "What it does not do", text: INTEGRITY },
      ],
    }),
  }),

  t<{ business: string; product: string; url: string }>({
    id: "biz-checkout-abandoned", purpose: "billing", kind: "marketing", to: "owner",
    name: "Checkout not finished",
    about: "They started a purchase and did not complete it.",
    trigger: "A PENDING order with no payment after 24 hours.",
    goal: "Recover a sale that was nearly made. Usually a card or a distraction, not a change of mind.",
    subject: (d) => `You didn't finish setting up ${d.product}`,
    sample: { business: "e5 Bakehouse", product: "Premium profile", url: link("/owner") },
    build: (d) => ({
      preheader: "Your basket is still there if you want it.",
      blocks: [
        { t: "lead", text: `You started adding ${d.product} to ${d.business} and did not finish.` },
        { t: "p", text: "Nothing has been charged. If it was a card problem or you simply got pulled away, you can pick it up where you left off." },
        { t: "button", label: "Finish setting it up", href: d.url },
        { t: "p", small: true, muted: true, text: "If you changed your mind, that is completely fine — ignore this and we will not chase it again." },
      ],
    }),
  }),

  // ============================================================ 5. Post-purchase: make them feel it
  t<{ business: string; url: string }>({
    id: "biz-premium-unused", purpose: "billing", kind: "lifecycle", to: "owner",
    name: "Premium bought, not set up",
    about: "They are paying and have not used the features.",
    trigger: "Premium active 7 days with no gallery, offer or enquiry form in use.",
    goal: "Stops the churn that comes from paying for something you never switched on. The highest-value retention email there is.",
    subject: (d) => `You are paying for Premium on ${d.business} — let's switch it on`,
    sample: { business: "e5 Bakehouse", url: link("/owner") },
    build: (d) => ({
      preheader: "Three things to set up, about ten minutes.",
      blocks: [
        { t: "note", tone: "warn", title: "Not set up yet", text: `${d.business} has Premium but none of it is switched on.` },
        { t: "p", text: "You are paying for this, so let's make it earn its keep. Three things, about ten minutes:" },
        { t: "steps", items: [
          { title: "Add your photos", text: "A gallery is the single biggest difference on a profile." },
          { title: "Write your offer", text: "One line about whatever you are pushing this month." },
          { title: "Turn on the enquiry form", text: "Leads arrive by email and you reply straight to the customer." },
        ] },
        { t: "button", label: "Set up Premium", href: d.url },
      ],
    }),
  }),

  t<{ business: string; ends: string; impressions: number; clicks: number; url: string }>({
    id: "biz-campaign-results", purpose: "billing", kind: "lifecycle", to: "owner",
    name: "Featured campaign results",
    about: "Honest numbers at the end of a featured run, then an option to repeat.",
    trigger: "A featured campaign ends.",
    goal: "Repeat purchase, earned by showing what actually happened — including when it is unimpressive.",
    subject: (d) => `How your featured slot did for ${d.business}`,
    sample: { business: "e5 Bakehouse", ends: "6 October", impressions: 4820, clicks: 131, url: link("/advertise") },
    build: (d) => ({
      preheader: "The numbers from your featured run.",
      blocks: [
        { t: "lead", text: `Your featured slot for ${d.business} finished on ${d.ends}.` },
        { t: "facts", rows: [
          ["Times it was shown", String(d.impressions)],
          ["Clicks to your profile", String(d.clicks)],
          ["Click rate", `${((d.clicks / Math.max(1, d.impressions)) * 100).toFixed(1)}%`],
        ] },
        { t: "p", text: "Those are the real figures, counted from people rather than bots. If they look good to you, you can book another run. If they do not, do not book one — we would rather you spent the money where it works." },
        { t: "button", label: "Book another run", href: d.url },
      ],
    }),
  }),

  // ============================================================ 6. Retention and dunning
  t<{ business: string; amount: string; date: string; url: string }>({
    id: "biz-renewal-notice", purpose: "billing", kind: "service", to: "owner",
    name: "Renewal reminder",
    about: "Advance notice before an annual payment.",
    trigger: "14 days before an annual subscription renews.",
    goal: "No surprise charges. A surprise charge costs more in trust than the renewal is worth.",
    subject: (d) => `${d.business}: your PrimeStreet subscription renews on ${d.date}`,
    sample: { business: "e5 Bakehouse", amount: "£290 + VAT", date: "24 October 2026", url: link("/owner") },
    build: (d) => ({
      preheader: "Advance notice, so nothing is a surprise.",
      blocks: [
        { t: "lead", text: `Your Premium subscription for ${d.business} renews soon.` },
        { t: "facts", rows: [["Renews", d.date], ["Amount", d.amount]] },
        { t: "p", text: "Nothing to do if you are happy. If you would rather stop, cancel before that date and you keep Premium until it ends." },
        { t: "button", label: "Manage my subscription", href: d.url },
      ],
    }),
  }),

  t<{ business: string; last4?: string; url: string }>({
    id: "biz-card-expiring", purpose: "billing", kind: "service", to: "owner",
    name: "Card expiring",
    about: "The card on file is about to expire.",
    trigger: "The card on file expires within 21 days.",
    goal: "Prevents involuntary churn, which is the cheapest churn to avoid.",
    subject: (d) => `Your card for ${d.business} is about to expire`,
    sample: { business: "e5 Bakehouse", last4: "4242", url: link("/owner") },
    build: (d) => ({
      preheader: "Update it and nothing changes.",
      blocks: [
        { t: "lead", text: `The card we have for ${d.business}${d.last4 ? ` ending ${d.last4}` : ""} expires shortly.` },
        { t: "p", text: "Update it now and your Premium features carry on without interruption." },
        { t: "button", label: "Update my card", href: d.url },
      ],
    }),
  }),

  t<{ business: string; grace: string; url: string }>({
    id: "biz-payment-final", purpose: "billing", kind: "service", to: "owner",
    name: "Final payment warning",
    about: "Last notice before Premium switches off.",
    trigger: "Payment has failed and the grace period ends in 2 days.",
    goal: "Recover the payment, and make the consequence plain rather than quietly downgrading them.",
    subject: (d) => `Last notice: Premium for ${d.business} stops on ${d.grace}`,
    sample: { business: "e5 Bakehouse", grace: "13 October", url: link("/owner") },
    build: (d) => ({
      preheader: "Your gallery, offer and enquiry form switch off.",
      blocks: [
        { t: "note", tone: "bad", title: "Action needed", text: `Premium for ${d.business} switches off on ${d.grace}.` },
        { t: "p", text: "We have not been able to take payment. When it stops, your gallery, offer banner and enquiry form come off the profile. Your reviews, rating and listing all stay exactly as they are." },
        { t: "button", label: "Fix my payment", href: d.url },
      ],
    }),
  }),

  t<{ business: string; ended: string; url: string }>({
    id: "biz-premium-ended", purpose: "billing", kind: "service", to: "owner",
    name: "Premium has ended",
    about: "Confirms what changed and what did not.",
    trigger: "A subscription ends, whether cancelled or lapsed.",
    goal: "Leave honestly. An ugly exit guarantees they never come back.",
    subject: (d) => `Premium has ended for ${d.business}`,
    sample: { business: "e5 Bakehouse", ended: "6 October", url: link("/owner") },
    build: (d) => ({
      preheader: "What changed, and what stayed.",
      blocks: [
        { t: "lead", text: `Premium for ${d.business} ended on ${d.ended}.` },
        { t: "facts", rows: [
          ["Gone for now", "Gallery, offer banner, enquiry form, click analytics"],
          ["Untouched", "Your listing, reviews, rating and search position"],
        ] },
        { t: "p", text: "Your photos and offer text are saved, not deleted. If you come back they reappear exactly as you left them." },
        { t: "button", label: "Restart Premium", href: d.url },
      ],
    }),
  }),

  t<{ business: string; views: number; enquiries: number; url: string }>({
    id: "biz-winback", purpose: "billing", kind: "marketing", to: "owner",
    name: "Win-back",
    about: "A single return offer, based on what their profile did while they were away.",
    trigger: "30 days after a subscription ended, if the profile is still getting traffic.",
    goal: "Reactivation. Sent once, with their own numbers rather than a discount.",
    subject: (d) => `${d.business} still had ${d.views} views last month`,
    sample: { business: "e5 Bakehouse", views: 356, enquiries: 4, url: link("/owner") },
    build: (d) => ({
      preheader: "People are still finding you.",
      blocks: [
        { t: "lead", text: `People are still finding ${d.business} on PrimeStreet.` },
        { t: "facts", rows: [["Views last month", String(d.views)], ["Enquiries you could have taken", String(d.enquiries)]] },
        { t: "p", text: "Your photos and offer are still saved. Turning Premium back on puts them live again in a couple of clicks." },
        { t: "button", label: "Turn Premium back on", href: d.url },
        { t: "p", small: true, muted: true, text: "This is the only email we will send about coming back." },
      ],
    }),
  }),

  // ============================================================ 7. Relationship: the ones that cost nothing
  t<{ business: string; title: string; url: string }>({
    id: "biz-featured-in-article", purpose: "editorial", kind: "lifecycle", to: "owner",
    name: "We wrote about you",
    about: "Tells a business it appears in a piece of editorial.",
    trigger: "An article naming the business is published.",
    goal: "The single best goodwill email there is, and it costs nothing. These are the people who later buy.",
    subject: (d) => `${d.business} is in a PrimeStreet article`,
    sample: { business: "e5 Bakehouse", title: "The Hackney arches that became a bakery", url: link("/stories/hackney-arches") },
    build: (d) => ({
      preheader: "No charge, and nothing was asked of you.",
      blocks: [
        { t: "note", tone: "good", title: "You're in it", text: `${d.business} appears in "${d.title}".` },
        { t: "p", text: "Our writers chose this independently. Nobody paid for it and nothing is expected from you — we are telling you so you hear it from us first, and can share it if you want to." },
        { t: "button", label: "Read the article", href: d.url },
        { t: "p", small: true, muted: true, text: "If anything about your business is wrong in it, reply and we will correct it quickly." },
      ],
    }),
  }),

  t<{ business: string; name: string; url: string }>({
    id: "biz-podcast-invite", purpose: "editorial", kind: "lifecycle", to: "owner",
    name: "Podcast invitation",
    about: "Invites an owner onto the podcast.",
    trigger: "An editor picks a guest.",
    goal: "Content that costs nothing to make, and a relationship that is worth more than any advert.",
    subject: (d) => `Would you come on the PrimeStreet podcast?`,
    sample: { business: "e5 Bakehouse", name: "Ben", url: link("/podcast") },
    build: (d) => ({
      preheader: "Half an hour, your story, no charge.",
      monitored: true,
      blocks: [
        { t: "lead", text: `${d.name} — we would like to have you on the PrimeStreet podcast.` },
        { t: "p", text: `We talk to London business owners about how the thing actually works: what it costs, what went wrong, what you would do differently. About half an hour, recorded remotely or at your place.` },
        { t: "p", text: "There is no charge and nothing to buy. We are asking because the story is interesting." },
        { t: "button", label: "Hear a recent episode", href: d.url },
        { t: "p", text: "Just reply to this email if you are up for it." },
      ],
    }),
  }),

  // ============================================================ 8. Security and admin
  t<{ business: string; attemptedBy: string }>({
    id: "biz-claim-attempt", purpose: "claims", kind: "service", to: "owner",
    name: "Someone tried to claim your business",
    about: "Security notice to the current owner.",
    trigger: "A claim is submitted for a business that is already claimed.",
    goal: "Trust. Nobody should take over a listing quietly.",
    subject: (d) => `Someone asked to claim ${d.business}`,
    sample: { business: "e5 Bakehouse", attemptedBy: "b***@gmail.com" },
    build: (d) => ({
      preheader: "No change has been made.",
      blocks: [
        { t: "note", tone: "warn", title: "For your information", text: `Someone asked to claim ${d.business}, which you already manage.` },
        { t: "facts", rows: [["Requested by", d.attemptedBy], ["Status", "Nothing has changed"]] },
        { t: "p", text: "An editor will look at it. If this was a colleague, tell us and we will add them properly. If you do not recognise it, say so and we will refuse it." },
      ],
    }),
  }),

  t<{ business: string; name: string; addedBy: string }>({
    id: "biz-team-added", purpose: "claims", kind: "service", to: "owner",
    name: "Someone was added to your business",
    about: "A second manager now has access.",
    trigger: "A new owner is linked to a business.",
    goal: "Nobody gains access silently.",
    subject: (d) => `${d.name} can now manage ${d.business}`,
    sample: { business: "e5 Bakehouse", name: "Priya Shah", addedBy: "an editor" },
    build: (d) => ({
      preheader: "A new person has access to your profile.",
      blocks: [
        { t: "lead", text: `${d.name} can now manage ${d.business} on PrimeStreet.` },
        { t: "p", text: `This was set up by ${d.addedBy}. They can edit the profile and reply to reviews. If that is not right, tell us and we will remove the access straight away.` },
      ],
    }),
  }),

  t<{ business: string; amount: string; period: string; invoiceUrl: string }>({
    id: "biz-receipt", purpose: "billing", kind: "service", to: "owner",
    name: "Receipt",
    about: "Confirms a payment, with the VAT note.",
    trigger: "A payment succeeds.",
    goal: "Bookkeeping. A business that cannot get a receipt will not buy twice.",
    subject: (d) => `Receipt for ${d.business} — ${d.amount}`,
    sample: { business: "e5 Bakehouse", amount: "£34.80", period: "6 October – 6 November 2026", invoiceUrl: link("/owner") },
    build: (d) => ({
      preheader: "For your records.",
      blocks: [
        { t: "lead", text: "Thanks — your payment went through." },
        { t: "facts", rows: [["Business", d.business], ["Amount", d.amount], ["Period", d.period]] },
        { t: "button", label: "Download the invoice", href: d.invoiceUrl },
        { t: "p", small: true, muted: true, text: "Amounts include VAT where it applies. The invoice shows the breakdown." },
      ],
    }),
  }),

  t<{ name: string; interest: string; url: string }>({
    id: "biz-sales-ack", purpose: "hello", kind: "service", to: "prospect",
    name: "We got your advertising enquiry",
    about: "Replies to someone who asked about advertising.",
    trigger: "An advertising or sponsorship enquiry is submitted.",
    goal: "Nobody should wonder whether a sales enquiry arrived. Sent from the monitored inbox.",
    subject: () => "Thanks — we have your enquiry",
    sample: { name: "Priya", interest: "sponsorship", url: link("/advertise") },
    build: (d) => ({
      preheader: "A person will come back to you.",
      monitored: true,
      blocks: [
        { t: "lead", text: `Thanks ${d.name} — your ${d.interest} enquiry has reached us.` },
        { t: "p", text: "Someone will reply properly within two working days. If it is urgent, just reply to this email and it reaches a person." },
        { t: "secondary", label: "What we offer, and what we won't do", href: d.url },
        { t: "note", tone: "info", title: "Worth saying up front", text: "Everything paid for is labelled, and advertising never affects ratings, reviews, search order or who we write about." },
      ],
    }),
  }),
];

export const bizById = (id: string) => BUSINESS_TEMPLATES.find((x) => x.id === id);
