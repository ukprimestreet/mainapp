"use server";

import { redirect } from "next/navigation";
import { checkFormToken, ipHash, isDisposableEmail } from "@/lib/antispam";
import { db } from "@/lib/db";
import { createJobRequest, isUrgency, validateJob, type JobInput } from "@/lib/leads";

export type QuoteState = {
  errors?: Record<string, string>;
  message?: string;
  values?: Record<string, string>;
};

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/**
 * Takes a customer's job request.
 *
 * What this does not do: decide who gets it. Matching and the credit charge are Phase D. Recording the
 * request honestly comes first, because a lead we lost while deciding where to send it is worse than one
 * sitting in a queue an administrator can see.
 */
export async function requestQuotes(_: QuoteState, fd: FormData): Promise<QuoteState> {
  // The same anti-abuse controls as the registration and enquiry forms.
  if (s(fd, "company_site")) return { message: "Thanks — we have your request." }; // honeypot
  const token = checkFormToken(s(fd, "ft"), { minMs: 4000 });
  if (token === "too-fast") return { message: "That was very quick. Please check your details and send it again." };
  if (token !== "ok") return { message: "This form has expired. Please reload the page and try again." };

  const urgency = s(fd, "urgency");
  const input: JobInput = {
    name: s(fd, "name"),
    email: s(fd, "email"),
    phone: s(fd, "phone"),
    categoryId: s(fd, "categoryId"),
    placeId: s(fd, "placeId"),
    postcode: s(fd, "postcode") || undefined,
    description: s(fd, "description"),
    urgency: isUrgency(urgency) ? urgency : "FLEXIBLE",
    contactTime: s(fd, "contactTime") || undefined,
    // Separate from the consent to be contacted about the job, and never pre-ticked.
    marketingOptIn: s(fd, "marketingOptIn") === "yes",
  };

  // Keep what they typed, so a rejected form never costs somebody their description.
  const values = {
    name: input.name, email: input.email, phone: input.phone, description: input.description,
    contactTime: input.contactTime ?? "", postcode: input.postcode ?? "",
  };

  let problems: Awaited<ReturnType<typeof validateJob>>;
  try {
    problems = await validateJob(input);
  } catch {
    return { values, message: "We cannot take requests at the moment — something on our side, not yours. Please try again shortly." };
  }
  if (isDisposableEmail(input.email)) problems.push({ field: "email", message: "Please use an email address a business can actually reach you on." });
  if (!s(fd, "consent")) problems.push({ field: "form", message: "Please confirm you are happy for us to pass your request to local businesses." });

  // Postcode is optional, but if it is given it has to look like one: a wrong postcode sends a trade to the
  // wrong street. Only the outward and inward shape is checked — we never ask for a full address here.
  if (input.postcode && !/^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(input.postcode)) {
    problems.push({ field: "postcode", message: "That does not look like a full postcode. Leave it blank if you would rather not say." });
  }

  if (problems.length) {
    const errors: Record<string, string> = {};
    for (const p of problems) errors[p.field] ??= p.message;
    return { errors, values, message: "Please fix the highlighted fields." };
  }

  // Three live requests a day from one email is a mistake or a test, not a person with three jobs.
  const recent = await db.jobRequest.count({
    where: { email: input.email.toLowerCase(), createdAt: { gte: new Date(Date.now() - 86400_000) } },
  });
  if (recent >= 5) {
    return { values, message: "You have sent several requests today already. Email us instead and a person will pick it up." };
  }

  let reference: string;
  try {
    const result = await createJobRequest(input, await ipHash());
    reference = result.request.reference;
  } catch {
    return { values, message: "We could not record that request — something on our side, not yours. Please try again shortly, or email us and a person will take it down for you." };
  }

  // No email to the customer yet: the only honest message is "a business will contact you", and until
  // Phase D assigns one we cannot say which. The confirmation page says exactly what we know.
  redirect(`/get-quotes/sent?ref=${encodeURIComponent(reference)}`);
}
