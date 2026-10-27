"use server";

import { redirect } from "next/navigation";
import { adminSession, requirePermission } from "@/lib/auth";
import { approveRegistration, rejectRegistration } from "@/lib/registration";
import { db } from "@/lib/db";
import { bizPath } from "@/lib/queries";
import { sendMail, siteLink } from "@/lib/mail";

const s = (f: FormData, k: string) => ((f.get(k) as string | null) ?? "").toString();
const back = (m: string): never => redirect(`/admin/registrations?msg=${encodeURIComponent(m)}`);

const who = async () => {
  const session = await adminSession();
  return session?.kind === "USER" ? session.admin.email : "shared-password session";
};

/** Approve: creates the listing, grants ownership, grants the five credits. One step, one queue. */
export async function approveRegistrationAction(fd: FormData) {
  await requirePermission("moderation.handle");
  const id = s(fd, "id");
  const result = await approveRegistration(id, { verified: s(fd, "verified") === "1", reviewedBy: await who() });
  if (result.error || !result.business) back(result.error ?? "Could not approve that registration.");
  const business = result.business!, owner = result.owner!, credits = result.credits!;

  // The real listing URL, built the same way the site builds it, rather than assembled by hand.
  const listing = await db.business.findUnique({
    where: { id: business.id },
    include: { city: { select: { slug: true } }, category: { select: { slug: true } } },
  });
  // Tell them it is live, and how to get in. The owner sign-in is passwordless, so the dashboard link is
  // enough: they request a link from there with the email we have just verified.
  await sendMail(
    owner.email,
    `${business.name} is live on PrimeStreet`,
    [
      `${owner.name},`,
      "",
      `${business.name} is now listed on PrimeStreet.`,
      "",
      listing ? `Your listing: ${siteLink(bizPath(listing))}` : "",
      "",
      credits.granted
        ? `Five lead credits have been added to your account, so customer enquiries can reach you straight away. Credits are £1 each after that, and you never have to buy any to keep your listing.`
        : `Your lead credits are in your dashboard.`,
      "",
      "Manage your listing, reply to reviews and see enquiries here:",
      siteLink("/owner"),
      "",
      "Sign in with this email address and we will send you a link — there is no password to remember.",
      "",
      "What we will never do: change your rating, your reviews or your position in search because of anything you pay us.",
    ].join("\n"),
    { purpose: "accounts" },
  );

  back(`${business.name} is live${credits.granted ? ` with ${credits.credits} credits` : ""}. The owner has been emailed.`);
}

/** Reject, with a reason the person is actually told. */
export async function rejectRegistrationAction(fd: FormData) {
  await requirePermission("moderation.handle");
  const id = s(fd, "id"), reason = s(fd, "reason").trim();
  const result = await rejectRegistration(id, reason, await who());
  if (result.error) back(result.error);

  const row = await db.businessSubmission.findUnique({ where: { id } });
  if (row) {
    await sendMail(
      row.submitterEmail,
      `About your PrimeStreet registration for ${row.name}`,
      [
        `${row.submitterName},`,
        "",
        `We have not been able to publish the listing for ${row.name}. The reason:`,
        reason,
        "",
        "If that is something you can put right, reply to this email and we will look again. We would rather list you than not.",
      ].join("\n"),
      { purpose: "accounts" },
    );
  }
  back("Rejected, and they have been told why.");
}
