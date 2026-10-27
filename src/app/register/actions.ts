"use server";

import { redirect } from "next/navigation";
import { checkFormToken, ipHash, isDisposableEmail } from "@/lib/antispam";
import { db } from "@/lib/db";
import { sendMail, siteLink } from "@/lib/mail";
import { checkExisting, submitRegistration, validate, type RegistrationInput } from "@/lib/registration";

export type RegisterState = {
  errors?: Record<string, string>;
  message?: string;
  /** Set when the business is already listed: the person is offered the claim route instead. */
  existing?: { name: string; href: string; reason: string };
  values?: Record<string, string>;
};

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
/** De-duplicated: a repeated id is a form quirk, not an unknown place, and must not read as one. */
const list = (fd: FormData, k: string) => [...new Set((fd.getAll(k) as string[]).filter(Boolean))];

/**
 * Registers a business.
 *
 * Nothing is created in the directory here and no credits are granted: this records what the person told us
 * and proves we can reach them. The listing, the ownership and the credits all happen on approval, in one
 * step, from the existing moderation queue.
 */
export async function register(_: RegisterState, fd: FormData): Promise<RegisterState> {
  // Same anti-abuse controls as the enquiry form, which have been in production for months.
  if (s(fd, "company_site")) return { message: "Thanks — we have your registration." }; // honeypot
  const token = checkFormToken(s(fd, "ft"), { minMs: 4000 });
  if (token === "too-fast") return { message: "That was very quick. Please check your details and send it again." };
  if (token !== "ok") return { message: "This form has expired. Please reload the page and try again." };

  const input: RegistrationInput = {
    businessName: s(fd, "businessName"),
    description: s(fd, "description"),
    phone: s(fd, "phone") || undefined,
    website: s(fd, "website") || undefined,
    postcode: s(fd, "postcode"),
    address: s(fd, "address") || undefined,
    udprn: s(fd, "udprn") || undefined,
    placeId: s(fd, "placeId"),
    categoryIds: list(fd, "categoryIds"),
    serviceAreaIds: list(fd, "serviceAreaIds"),
    serviceAreaMode: s(fd, "serviceAreaMode") === "INCLUDES_CHILDREN" ? "INCLUDES_CHILDREN" : "EXACT",
    contactName: s(fd, "contactName"),
    contactEmail: s(fd, "contactEmail"),
    contactRole: s(fd, "contactRole"),
  };

  const problems = await validate(input);
  if (isDisposableEmail(input.contactEmail)) problems.push({ field: "contactEmail", message: "Please use a permanent email address we can reach you on." });

  // One submission per email per day. A business registering twice is a mistake, not a use case.
  const recent = await db.businessSubmission.count({
    where: { submitterEmail: input.contactEmail.toLowerCase(), createdAt: { gte: new Date(Date.now() - 86400_000) } },
  });
  if (recent >= 3) problems.push({ field: "form", message: "You have registered several businesses today already. Email us instead and a person will help." });

  if (problems.length) {
    const errors: Record<string, string> = {};
    for (const p of problems) errors[p.field] ??= p.message;
    return { errors, message: "Please fix the highlighted fields." };
  }

  // Already listed? Then this is a claim, not a registration — the specific failure D5 warned about.
  const existing = await checkExisting({
    businessName: input.businessName, website: input.website, phone: input.phone, placeId: input.placeId,
  });
  if (existing && s(fd, "confirmedNotDuplicate") !== "yes") {
    return {
      existing: {
        name: existing.business.name,
        href: `/claim?business=${encodeURIComponent(existing.business.slug)}`,
        reason: existing.reason,
      },
    };
  }

  const { submission, token: verifyToken } = await submitRegistration(input, existing?.business.id ?? null);

  await sendMail(
    submission.submitterEmail,
    `Confirm your email to finish registering ${submission.name}`,
    [
      `${submission.submitterName},`,
      "",
      `Thanks for registering ${submission.name} on PrimeStreet. One step left: confirm this is your email address.`,
      "",
      siteLink(`/register/verify/${verifyToken}`),
      "",
      "Once you have, a person reviews the listing before it goes live — usually within a working day. We check because a directory nobody checks is not worth reading.",
      "",
      "What happens then: your listing goes live, you get access to your dashboard, and five lead credits are added to your account so you can receive customer enquiries. Credits are £1 each after that, and you never have to buy any to keep your listing.",
      "",
      "If you did not register this business, ignore this email and nothing happens.",
    ].join("\n"),
    { purpose: "accounts" },
  );

  redirect(`/register/sent?email=${encodeURIComponent(submission.submitterEmail)}`);
}
