import { SITE } from "../constants";
import type { MailPurpose } from "../mail";
import type { Block, EmailDoc } from "./layout";

/**
 * The catalogue of every email PrimeStreet sends.
 *
 * One layout, many small definitions: the brand, the wordmark, the footer and the do-not-reply rule live in
 * layout.ts and are never repeated here. Adding an email means adding a definition, not another template to
 * keep in step.
 *
 * `sample` exists so every template can be previewed and tested without having to manufacture real data.
 */
const link = (p: string) => `${SITE.url}${p}`;

export type Template<D = Record<string, unknown>> = {
  id: string;
  purpose: MailPurpose;
  name: string;
  about: string;
  /** Who receives it. */
  to: "writer" | "owner" | "reviewer" | "reader" | "team";
  subject: (d: D) => string;
  build: (d: D) => Omit<EmailDoc, "purpose">;
  sample: D;
};

const t = <D,>(x: Template<D>) => x as unknown as Template;

// ================================================================ writers: account
export const TEMPLATES: Template[] = [
  t<{ name: string; link: string; days: number }>({
    id: "writer-invite", purpose: "accounts", to: "writer",
    name: "Writer invitation", about: "An editor has created an account; set a password to finish.",
    subject: () => "Finish setting up your PrimeStreet writer account",
    sample: { name: "Ada Writer", link: link("/write/welcome/sample-token"), days: 7 },
    build: (d) => ({
      preheader: "Choose a password and your writer account is ready.",
      blocks: [
        { t: "lead", text: `Hello ${d.name} — an editor has created a writer account for you.` },
        { t: "p", text: "To finish setting it up, choose a password. After that you will sign in with your email address and the password you pick." },
        { t: "button", label: "Set my password", href: d.link },
        { t: "p", small: true, muted: true, text: `This link works once and expires in ${d.days} days. If it expires, ask an editor to send another.` },
        { t: "divider" },
        { t: "h", text: "What happens next" },
        { t: "steps", items: [
          { title: "Complete your profile", text: "Readers should be able to see who wrote a piece. Your profile must be 90% complete before you can file." },
          { title: "Write", text: "Drafts stay private for as long as you like." },
          { title: "Submit for review", text: "An editor publishes it or sends it back with feedback. Every decision comes with a reason." },
        ] },
      ],
    }),
  }),

  t<{ name: string; termsUrl: string; dashboardUrl: string }>({
    id: "writer-welcome", purpose: "editorial", to: "writer",
    name: "Writer welcome", about: "Sent once a writer sets their password: what is expected of them.",
    subject: () => "Welcome to PrimeStreet — what happens next",
    sample: { name: "Ada", termsUrl: link("/write/terms"), dashboardUrl: link("/write") },
    build: (d) => ({
      preheader: "How PrimeStreet works, and what we expect of you.",
      blocks: [
        { t: "lead", text: `Welcome, ${d.name}. Your writer account is ready.` },
        { t: "p", text: "PrimeStreet publishes real things about real London businesses. Four rules carry most of that." },
        { t: "steps", items: [
          { title: "Complete your profile first", text: "A portrait, a job title, an about-you section, a phone number, where you are based, past experience, a CV, the subjects you cover, a social link and a link to published work. 90% unlocks filing." },
          { title: "Write in your own words, from sources you can name", text: "No invented facts, no invented quotes, nothing copied from other directories. Cite the primary source and say when you checked it." },
          { title: "Label anything paid for", text: "Sponsored, partner and advertorial pieces name the sponsor. Editorial independence is the product." },
          { title: "Submit, then an editor reviews", text: "You will always get a decision with a reason attached." },
        ] },
        { t: "button", label: "Open my dashboard", href: d.dashboardUrl },
        { t: "secondary", label: "Read the full author terms", href: d.termsUrl },
      ],
    }),
  }),

  t<{ name: string; link: string; minutes: number }>({
    id: "password-reset", purpose: "accounts", to: "writer",
    name: "Password reset", about: "Someone asked to reset a writer password.",
    subject: () => "Reset your PrimeStreet password",
    sample: { name: "Ada", link: link("/write/reset/sample-token"), minutes: 60 },
    build: (d) => ({
      preheader: "A link to choose a new password.",
      blocks: [
        { t: "lead", text: `Hello ${d.name} — here is your reset link.` },
        { t: "button", label: "Choose a new password", href: d.link },
        { t: "p", small: true, muted: true, text: `It works once and expires in ${d.minutes} minutes. Setting a new password also signs you out on other devices.` },
        { t: "note", tone: "info", title: "Didn't ask for this?", text: "You can ignore this email. Nothing has changed and your current password still works." },
      ],
    }),
  }),

  t<{ name: string }>({
    id: "password-changed", purpose: "accounts", to: "writer",
    name: "Password changed", about: "Confirmation after a password is set or changed.",
    subject: () => "Your PrimeStreet password was changed",
    sample: { name: "Ada" },
    build: (d) => ({
      preheader: "Confirming a change to your account.",
      blocks: [
        { t: "lead", text: `${d.name}, your password has been changed.` },
        { t: "p", text: "You have been signed out everywhere else. Sign in again with your new password." },
        { t: "button", label: "Sign in", href: link("/write/login") },
        { t: "note", tone: "bad", title: "Wasn't you?", text: "Tell us immediately — reply details are in the footer — and we will lock the account." },
      ],
    }),
  }),

  t<{ name: string; reason?: string }>({
    id: "writer-suspended", purpose: "accounts", to: "writer",
    name: "Account suspended", about: "An editor has suspended a writer account.",
    subject: () => "Your PrimeStreet writer account has been suspended",
    sample: { name: "Ada", reason: "We need to talk through a sourcing question on a recent piece." },
    build: (d) => ({
      preheader: "You cannot sign in for now.",
      blocks: [
        { t: "lead", text: `${d.name}, your writer account has been suspended.` },
        { t: "p", text: "You cannot sign in for now. Work you have already published stays online and keeps your byline." },
        ...(d.reason ? [{ t: "quote", text: d.reason, cite: "PrimeStreet editors" } as Block] : []),
        { t: "p", text: "If you think this is a mistake, get in touch and a person will look at it." },
      ],
    }),
  }),

  t<{ name: string; percent: number; missing: string[] }>({
    id: "profile-incomplete", purpose: "editorial", to: "writer",
    name: "Profile reminder", about: "A writer cannot file because their profile is under 90%.",
    subject: (d) => `Your profile is ${d.percent}% complete`,
    sample: { name: "Ada", percent: 65, missing: ["Portrait photo", "CV", "Links to published work"] },
    build: (d) => ({
      preheader: "A few things left before you can send work for review.",
      blocks: [
        { t: "lead", text: `${d.name}, you are nearly there.` },
        { t: "stat", value: `${d.percent}%`, label: "profile complete — 90% unlocks filing" },
        { t: "p", text: "Readers should be able to see who wrote a piece and why they are worth reading. That is the only reason we ask." },
        { t: "h", text: "Still to add" },
        { t: "list", items: d.missing },
        { t: "button", label: "Finish my profile", href: link("/write/profile") },
      ],
    }),
  }),

  // ================================================================ writers: editorial
  t<{ name: string; title: string; url: string; note: string }>({
    id: "article-approved", purpose: "editorial", to: "writer",
    name: "Article published", about: "An editor approved a submission.",
    subject: (d) => `Published: ${d.title}`,
    sample: { name: "Ada", title: "Five checks before you pay a deposit to a London trade", url: link("/guides/checks-before-paying-a-deposit"), note: "Clear, useful and properly sourced. The London-specific section is the part readers will remember." },
    build: (d) => ({
      preheader: "Your piece is live on PrimeStreet.",
      blocks: [
        { t: "note", tone: "good", title: "Approved", text: `"${d.title}" is live.` },
        { t: "lead", text: `Nice work, ${d.name}.` },
        { t: "h", text: "What the editor said" },
        { t: "quote", text: d.note, cite: "PrimeStreet editors" },
        { t: "button", label: "Read it live", href: d.url },
      ],
    }),
  }),

  t<{ name: string; title: string; url: string; note: string }>({
    id: "article-changes", purpose: "editorial", to: "writer",
    name: "Changes requested", about: "An editor sent a piece back with feedback.",
    subject: (d) => `Changes requested: ${d.title}`,
    sample: { name: "Ada", title: "Why rents are rising on Kingsland Road", url: link("/write/articles/abc"), note: "The argument works, but the rent figures need a named source and a date. Add those and send it back." },
    build: (d) => ({
      preheader: "An editor has read it and asked for some changes.",
      blocks: [
        { t: "note", tone: "bad", title: "Changes requested", text: `"${d.title}" is back in your drafts.` },
        { t: "lead", text: `${d.name}, an editor has read this and wants a few things changed.` },
        { t: "quote", text: d.note, cite: "PrimeStreet editors" },
        { t: "p", text: "Nothing is lost: your draft is exactly as you left it, with this note attached." },
        { t: "button", label: "Open my draft", href: d.url },
      ],
    }),
  }),

  t<{ name: string; title: string; url: string }>({
    id: "article-received", purpose: "editorial", to: "writer",
    name: "Submission received", about: "Acknowledges a submission so a writer is not left wondering.",
    subject: (d) => `Received: ${d.title}`,
    sample: { name: "Ada", title: "Why rents are rising on Kingsland Road", url: link("/write/articles/abc") },
    build: (d) => ({
      preheader: "It is with an editor now.",
      blocks: [
        { t: "lead", text: `Thanks ${d.name} — "${d.title}" is with an editor.` },
        { t: "p", text: "You will hear back with a decision and a reason either way. While it is in review you cannot edit it, but you can pull it back to a draft at any time." },
        { t: "secondary", label: "View the submission", href: d.url },
      ],
    }),
  }),

  t<{ name: string; message: string }>({
    id: "editor-message", purpose: "hello", to: "writer",
    name: "Message from an editor", about: "Person-to-person. Sent from the monitored inbox and invites a reply.",
    subject: () => "A message from the PrimeStreet editors",
    sample: { name: "Ada", message: "Could you take a look at the new business rates guidance this week? It would suit your Hackney reporting." },
    build: (d) => ({
      preheader: "From a person, not a robot.",
      monitored: true,
      blocks: [
        { t: "p", text: `${d.name},` },
        { t: "p", text: d.message },
        { t: "p", muted: true, text: "PrimeStreet editors" },
      ],
    }),
  }),

  // ================================================================ business owners
  t<{ link: string; minutes: number }>({
    id: "owner-signin", purpose: "accounts", to: "owner",
    name: "Owner sign-in link", about: "Passwordless sign-in for a business owner.",
    subject: () => "Your PrimeStreet sign-in link",
    sample: { link: link("/owner/login/sample-token"), minutes: 20 },
    build: (d) => ({
      preheader: "One tap to manage your business profile.",
      blocks: [
        { t: "lead", text: "Here is your sign-in link." },
        { t: "button", label: "Sign in to my dashboard", href: d.link },
        { t: "p", small: true, muted: true, text: `It works once and expires in ${d.minutes} minutes.` },
        { t: "note", tone: "info", title: "Didn't ask for this?", text: "Ignore this email. Nobody can sign in without the link, and nothing has changed." },
      ],
    }),
  }),

  t<{ business: string; link: string }>({
    id: "claim-confirm", purpose: "claims", to: "owner",
    name: "Confirm a claim", about: "Double opt-in before a claim is considered.",
    subject: (d) => `Confirm your claim of ${d.business}`,
    sample: { business: "e5 Bakehouse", link: link("/claim/status/sample-token") },
    build: (d) => ({
      preheader: "One click to confirm it was you.",
      blocks: [
        { t: "lead", text: `Someone asked to claim ${d.business} on PrimeStreet.` },
        { t: "p", text: "If that was you, confirm below and an editor will check the claim. We do this so nobody can claim a business using someone else's email address." },
        { t: "button", label: "Yes, that was me", href: d.link },
        { t: "p", small: true, muted: true, text: "If it wasn't you, ignore this email and nothing happens." },
      ],
    }),
  }),

  t<{ business: string; name: string }>({
    id: "claim-approved", purpose: "claims", to: "owner",
    name: "Claim approved", about: "The owner now controls the profile.",
    subject: (d) => `You now manage ${d.business} on PrimeStreet`,
    sample: { business: "e5 Bakehouse", name: "Ben" },
    build: (d) => ({
      preheader: "Your business profile is yours to edit.",
      blocks: [
        { t: "note", tone: "good", title: "Approved", text: `${d.business} is now yours to manage.` },
        { t: "lead", text: `${d.name}, your claim has been approved.` },
        { t: "h", text: "Worth doing first" },
        { t: "list", items: [
          "Check your opening hours, phone number and website are right.",
          "Add photos and the services you offer.",
          "Reply to any reviews — a reply is public and shows you are paying attention.",
        ] },
        { t: "button", label: "Open my dashboard", href: link("/owner") },
      ],
    }),
  }),

  t<{ business: string; reason: string }>({
    id: "claim-rejected", purpose: "claims", to: "owner",
    name: "Claim not approved", about: "A claim was refused, with the reason.",
    subject: (d) => `About your claim of ${d.business}`,
    sample: { business: "e5 Bakehouse", reason: "We could not match the email address to the business. A message from an address on the company's own domain would settle it." },
    build: (d) => ({
      preheader: "We could not approve it, and why.",
      blocks: [
        { t: "lead", text: `We could not approve your claim of ${d.business}.` },
        { t: "quote", text: d.reason, cite: "PrimeStreet editors" },
        { t: "p", text: "If you can clear that up, claim it again and we will take another look." },
        { t: "secondary", label: "Claim the business again", href: link("/claim") },
      ],
    }),
  }),

  t<{ business: string; customer: string; email: string; phone?: string; message: string }>({
    id: "new-enquiry", purpose: "enquiries", to: "owner",
    name: "Customer enquiry", about: "A customer wrote to a business. Reply-To is the customer.",
    subject: (d) => `New enquiry for ${d.business} via PrimeStreet`,
    sample: { business: "e5 Bakehouse", customer: "Lena Hart", email: "lena@example.com", phone: "07700 900123", message: "Do you take orders for a 40-person office breakfast on a Friday? And is there a vegan option?" },
    build: (d) => ({
      preheader: `${d.customer} sent you an enquiry. Reply to reach them directly.`,
      monitored: true,
      blocks: [
        { t: "note", tone: "good", title: "New enquiry", text: `Just hit reply and it goes straight to ${d.customer}.` },
        { t: "lead", text: `${d.customer} sent you an enquiry through your PrimeStreet profile.` },
        { t: "quote", text: d.message, cite: d.customer },
        { t: "facts", rows: [["Name", d.customer], ["Email", d.email], ...(d.phone ? [["Phone", d.phone] as [string, string]] : [])] },
        { t: "p", small: true, muted: true, text: "Every enquiry is also saved in your dashboard." },
        { t: "secondary", label: "See all enquiries", href: link("/owner") },
      ],
    }),
  }),

  t<{ business: string; rating: number; title: string; body: string; url: string }>({
    id: "new-review", purpose: "reviews", to: "owner",
    name: "New review on your profile", about: "A published review a business may want to answer.",
    subject: (d) => `New ${d.rating}-star review for ${d.business}`,
    sample: { business: "e5 Bakehouse", rating: 4, title: "Best sourdough in Hackney", body: "Queue moves fast and the rye is worth the walk. Seating is tight at weekends.", url: link("/owner") },
    build: (d) => ({
      preheader: "You can reply publicly.",
      blocks: [
        { t: "lead", text: `${d.business} has a new review.` },
        { t: "stat", value: `${d.rating}/5`, label: d.title },
        { t: "quote", text: d.body },
        { t: "p", text: "You can reply publicly. A reply shows other readers that you are paying attention — it is the single most useful thing you can do here." },
        { t: "button", label: "Reply to this review", href: d.url },
        { t: "p", small: true, muted: true, text: "Reviews cannot be bought, removed or reordered. If this one breaks our guidelines, report it and an editor will look." },
      ],
    }),
  }),

  t<{ business: string; views: number; clicks: number; enquiries: number; month: string }>({
    id: "owner-monthly", purpose: "alerts", to: "owner",
    name: "Monthly summary", about: "How a business did last month.",
    subject: (d) => `${d.business}: your ${d.month} summary`,
    sample: { business: "e5 Bakehouse", views: 412, clicks: 63, enquiries: 7, month: "September" },
    build: (d) => ({
      preheader: "Views, clicks and enquiries from last month.",
      blocks: [
        { t: "lead", text: `How ${d.business} did in ${d.month}.` },
        { t: "facts", rows: [["Profile views", String(d.views)], ["Website & phone clicks", String(d.clicks)], ["Enquiries", String(d.enquiries)]] },
        { t: "p", text: "Profiles with photos, full opening hours and replies to reviews get noticeably more of all three." },
        { t: "button", label: "Open my dashboard", href: link("/owner") },
      ],
    }),
  }),

  // ================================================================ reviewers
  t<{ business: string; link: string }>({
    id: "review-confirm", purpose: "reviews", to: "reviewer",
    name: "Confirm your review", about: "Double opt-in before a review is published.",
    subject: (d) => `Confirm your review of ${d.business}`,
    sample: { business: "e5 Bakehouse", link: link("/reviews/manage/sample-token") },
    build: (d) => ({
      preheader: "One click and an editor will check it over.",
      blocks: [
        { t: "lead", text: `Thanks for reviewing ${d.business}.` },
        { t: "p", text: "Confirm it was you, and an editor will check the review before it goes live. We do this so nobody can post a review in someone else's name." },
        { t: "button", label: "Confirm my review", href: d.link },
        { t: "p", small: true, muted: true, text: "If you didn't write a review, ignore this email and nothing is published." },
      ],
    }),
  }),

  t<{ business: string; url: string }>({
    id: "review-published", purpose: "reviews", to: "reviewer",
    name: "Your review is live", about: "A review passed moderation.",
    subject: (d) => `Your review of ${d.business} is live`,
    sample: { business: "e5 Bakehouse", url: link("/businesses/london/cafes/e5-bakehouse") },
    build: (d) => ({
      preheader: "Thanks — it is published.",
      blocks: [
        { t: "note", tone: "good", title: "Published", text: `Your review of ${d.business} is live.` },
        { t: "p", text: "Thank you. Honest reviews from real customers are the reason this directory is worth reading." },
        { t: "button", label: "See it on the profile", href: d.url },
        { t: "p", small: true, muted: true, text: "You can edit or remove your review at any time using the link in your confirmation email." },
      ],
    }),
  }),

  t<{ business: string; reason: string }>({
    id: "review-rejected", purpose: "reviews", to: "reviewer",
    name: "Review not published", about: "A review failed moderation, with the reason.",
    subject: (d) => `About your review of ${d.business}`,
    sample: { business: "e5 Bakehouse", reason: "It described a dispute with a named member of staff. We publish reviews of the service, not allegations about individuals." },
    build: (d) => ({
      preheader: "We could not publish it, and why.",
      blocks: [
        { t: "lead", text: `We could not publish your review of ${d.business}.` },
        { t: "quote", text: d.reason, cite: "PrimeStreet editors" },
        { t: "p", text: "You are welcome to write another that sticks to your own experience of the service." },
      ],
    }),
  }),

  // ================================================================ readers / newsletter
  t<{ link: string }>({
    id: "newsletter-confirm", purpose: "accounts", to: "reader",
    name: "Confirm your subscription", about: "Double opt-in for the weekly digest.",
    subject: () => "Confirm your PrimeStreet subscription",
    sample: { link: link("/newsletter/confirm/sample-token") },
    build: (d) => ({
      preheader: "One click and you are on the list.",
      blocks: [
        { t: "lead", text: "Almost there — just confirm it was you." },
        { t: "p", text: "You will get one email a week: what opened, who is hiring, and the businesses worth knowing about. Nothing else, and never a list we sold." },
        { t: "button", label: "Confirm my subscription", href: d.link },
        { t: "p", small: true, muted: true, text: "If you didn't sign up, ignore this and we will not email you again." },
      ],
    }),
  }),

  t<{ intro: string; items: { title: string; text: string }[]; unsubscribeUrl: string }>({
    id: "newsletter-digest", purpose: "digest", to: "reader",
    name: "Weekly digest", about: "The weekly newsletter, built only from real published content.",
    subject: () => "This week on PrimeStreet",
    sample: {
      intro: "Three guides on the paperwork that catches London businesses out, and what we learned trying to verify 19 of them.",
      items: [
        { title: "Five checks before you pay a deposit to a London trade", text: "Ten minutes of checking beats any star rating." },
        { title: "Small business rates in London, explained", text: "The relief that takes the bill to zero, and the London threshold people miss." },
        { title: "We tried to verify 19 London businesses. Three passed", text: "Why local business data online is so often wrong." },
      ],
      unsubscribeUrl: link("/newsletter/unsubscribe/sample-token"),
    },
    build: (d) => ({
      preheader: d.intro,
      unsubscribeUrl: d.unsubscribeUrl,
      blocks: [
        { t: "lead", text: d.intro },
        { t: "divider" },
        ...d.items.flatMap((i): Block[] => [
          { t: "h", text: i.title },
          { t: "p", text: i.text },
        ]),
        { t: "divider" },
        { t: "p", small: true, muted: true, text: "You are getting this because you asked for it. One click below stops it for good." },
      ],
    }),
  }),

  // ================================================================ billing
  t<{ business: string; plan: string; renews: string }>({
    id: "premium-active", purpose: "billing", to: "owner",
    name: "Premium started", about: "A premium subscription is now active.",
    subject: (d) => `Premium is on for ${d.business}`,
    sample: { business: "e5 Bakehouse", plan: "Premium profile — monthly", renews: "6 November 2026" },
    build: (d) => ({
      preheader: "Your extra profile features are live.",
      blocks: [
        { t: "note", tone: "good", title: "Active", text: `${d.plan} is running on ${d.business}.` },
        { t: "h", text: "What you now have" },
        { t: "list", items: ["A photo gallery on your profile", "An offer banner", "An enquiry form, with leads emailed to you", "Click analytics for website, phone and directions"] },
        { t: "facts", rows: [["Plan", d.plan], ["Next payment", d.renews]] },
        { t: "button", label: "Set up my premium profile", href: link("/owner") },
        { t: "p", small: true, muted: true, text: "Premium changes how much you can show. It never changes your rating, your reviews or where you appear in search." },
      ],
    }),
  }),

  t<{ business: string; grace: string }>({
    id: "payment-failed", purpose: "billing", to: "owner",
    name: "Payment failed", about: "A subscription payment did not go through.",
    subject: (d) => `Payment problem for ${d.business}`,
    sample: { business: "e5 Bakehouse", grace: "13 October 2026" },
    build: (d) => ({
      preheader: "Your premium features are still on for now.",
      blocks: [
        { t: "note", tone: "warn", title: "Action needed", text: `We could not take payment for ${d.business}.` },
        { t: "p", text: `Your premium features stay on until ${d.grace} while you sort it out. Usually it is an expired card.` },
        { t: "button", label: "Update my payment details", href: link("/owner") },
      ],
    }),
  }),

  // ================================================================ internal
  t<{ writer: string; title: string; url: string; links: number; external: number }>({
    id: "team-submission", purpose: "alerts", to: "team",
    name: "Submission for review", about: "Tells the editors something is waiting.",
    subject: (d) => `For review: ${d.title}`,
    sample: { writer: "Ada Writer", title: "Why rents are rising on Kingsland Road", url: link("/admin/review/abc"), links: 7, external: 4 },
    build: (d) => ({
      preheader: `${d.writer} has submitted a piece.`,
      blocks: [
        { t: "lead", text: `${d.writer} submitted "${d.title}".` },
        { t: "facts", rows: [["Writer", d.writer], ["Links in the piece", `${d.links} (${d.external} external)`]] },
        { t: "button", label: "Review it", href: d.url },
      ],
    }),
  }),

  t<{ name: string; email: string; company?: string; interest: string; message: string }>({
    id: "team-enquiry", purpose: "alerts", to: "team",
    name: "Advertising enquiry", about: "Someone asked about advertising or sponsorship.",
    subject: (d) => `New ${d.interest} enquiry from ${d.name}`,
    sample: { name: "Priya Shah", email: "priya@example.com", company: "Shah & Co", interest: "sponsorship", message: "We would like to sponsor the podcast next quarter. What does that involve?" },
    build: (d) => ({
      preheader: `${d.interest} enquiry.`,
      blocks: [
        { t: "lead", text: `${d.name} asked about ${d.interest}.` },
        { t: "facts", rows: [["Name", d.name], ["Email", d.email], ...(d.company ? [["Company", d.company] as [string, string]] : []), ["Interest", d.interest]] },
        { t: "quote", text: d.message, cite: d.name },
        { t: "button", label: "Open the enquiries list", href: link("/admin/commerce/enquiries") },
      ],
    }),
  }),
];

export const byId = (id: string) => TEMPLATES.find((x) => x.id === id);
export const templateCount = TEMPLATES.length;
