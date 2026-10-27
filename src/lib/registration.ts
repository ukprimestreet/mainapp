import { randomBytes } from "crypto";
import type { Business, Owner } from "@prisma/client";
import { db } from "./db";
import { sha256 } from "./antispam";
import { findDuplicate, normPhone, safeUrl, websiteHost, uniqueSlug, normName } from "./business";
import { claimEvidence, grantOwnership } from "./owner";
import { grantWelcomeCredits } from "./credits";
import { domainMatches } from "./business";
import { audit } from "./audit";

/**
 * Business registration (decision D5).
 *
 * A new front door onto the existing machinery, not a second machine. The risks raised when this option was
 * chosen are each answered here rather than left standing:
 *
 *   - **One primitive grants ownership.** `approveRegistration()` calls `grantOwnership()`, the only code
 *     that creates an `Owner` and a `BusinessOwner` link. There is no second route to becoming an owner.
 *   - **One evidence model.** `claimEvidence()` decides what may be approved and what may be marked
 *     verified. Registering cannot be a softer route to `VERIFIED` than claiming.
 *   - **One queue.** A registration is a `BusinessSubmission` with `kind = "REGISTRATION"`, so the existing
 *     moderation queue handles it. No second approval screen to keep in step.
 *   - **The welcome credits hang off a verified account**, granted at the moment ownership is granted, never
 *     at form submission. Otherwise five free credits are farmable by anyone with an email address.
 *   - **An existing listing becomes a claim.** `checkExisting()` uses the same `findDuplicate()` the admin
 *     import uses, so a registration cannot create a duplicate of a business we already list.
 */

export type RegistrationInput = {
  businessName: string;
  description: string;
  phone?: string;
  website?: string;
  postcode: string;
  address?: string;
  udprn?: string;
  placeId: string;
  categoryIds: string[];
  serviceAreaIds: string[];
  serviceAreaMode: "EXACT" | "INCLUDES_CHILDREN";
  contactName: string;
  contactEmail: string;
  contactRole: string;
};

export type Problem = { field: keyof RegistrationInput | "form"; message: string };

/** Everything a person could get wrong, checked server-side. The form is a convenience, not a control. */
export async function validate(input: RegistrationInput): Promise<Problem[]> {
  const p: Problem[] = [];
  const add = (field: Problem["field"], message: string) => p.push({ field, message });

  if (input.businessName.trim().length < 2) add("businessName", "Enter the name of the business.");
  if (input.businessName.trim().length > 120) add("businessName", "That name is too long.");
  if (input.description.trim().length < 60) add("description", "Tell customers what you do — at least 60 characters, in your own words.");
  if (input.description.trim().length > 3000) add("description", "That description is over 3,000 characters.");
  if (/<[a-z/]/i.test(input.description)) add("description", "Please write plain text, without HTML.");

  if (!input.contactName.trim()) add("contactName", "Enter your name.");
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(input.contactEmail.trim())) add("contactEmail", "Enter a valid email address.");
  if (input.contactRole.trim().length < 2) add("contactRole", "What is your role at the business?");

  if (input.phone && !/^([+\d][\d\s()-]{6,19})$/.test(input.phone.trim())) add("phone", "Enter a valid phone number.");
  if (input.website && !safeUrl(input.website)) add("website", "Enter a valid web address, starting with https://");

  if (!input.placeId) add("placeId", "Confirm where the business is based.");
  else if (!(await db.place.findUnique({ where: { id: input.placeId }, select: { id: true } }))) add("placeId", "That location is not one we recognise.");

  if (input.categoryIds.length === 0) add("categoryIds", "Choose at least one service you offer.");
  else {
    const found = await db.category.count({ where: { id: { in: input.categoryIds } } });
    if (found !== input.categoryIds.length) add("categoryIds", "One of those services is not one we recognise.");
  }

  if (input.serviceAreaIds.length === 0) add("serviceAreaIds", "Choose at least one area you cover.");
  else {
    const found = await db.place.count({ where: { id: { in: input.serviceAreaIds } } });
    if (found !== input.serviceAreaIds.length) add("serviceAreaIds", "One of those areas is not one we recognise.");
  }
  if (input.serviceAreaIds.length > 60) add("serviceAreaIds", "That is a lot of areas. Pick the ones you genuinely cover, or choose a whole borough.");

  return p;
}

/**
 * Is this business already listed?
 *
 * The specific failure the D5 warning was about. Uses the same duplicate detection as the admin import, so
 * registration and import cannot disagree about what counts as the same business.
 */
export type ExistingMatch = {
  business: { id: string; name: string; slug: string; city: { slug: string }; category: { slug: string } };
  reason: string;
};

export async function checkExisting(input: { businessName: string; website?: string; phone?: string; placeId: string }): Promise<ExistingMatch | null> {
  const place = await db.place.findUnique({ where: { id: input.placeId }, select: { legacyLocationId: true, parentId: true } });
  // findDuplicate() works on the legacy Location tree, which is still what Business rows point at.
  const locationId = place?.legacyLocationId
    ?? (place?.parentId ? (await db.place.findUnique({ where: { id: place.parentId }, select: { legacyLocationId: true } }))?.legacyLocationId : null);

  // findDuplicate returns { business, reason }, and its phone branch returns only a partial select, so the
  // id is the only field worth trusting from it. Everything a caller needs is re-read below.
  let id: string | null = null;
  let reason = "";

  if (locationId) {
    const hit = await findDuplicate({ name: input.businessName, locationId, phone: input.phone ?? null, website: input.website ?? null });
    if (hit) { id = hit.business.id; reason = hit.reason; }
  }

  if (!id) {
    // Belt and braces: a matching website host or normalised name anywhere, because a business that moved
    // borough is still the same business.
    const host = websiteHost(input.website);
    const or: { normName?: string; websiteHost?: string }[] = [{ normName: normName(input.businessName) }];
    if (host) or.push({ websiteHost: host });
    const wider = await db.business.findFirst({ where: { OR: or }, select: { id: true, websiteHost: true } });
    if (wider) {
      id = wider.id;
      reason = host && wider.websiteHost === host ? `same website (${host})` : "same business name";
    }
  }

  if (!id) return null;
  const business = await db.business.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true, city: { select: { slug: true } }, category: { select: { slug: true } } },
  });
  return business ? { business, reason } : null;
}

/**
 * Records a registration and returns the token for the verification email.
 *
 * Nothing is created in the directory here, and no credits are granted. All this does is capture what the
 * person told us and prove we can reach them.
 */
export async function submitRegistration(input: RegistrationInput, duplicateOfId?: string | null) {
  const token = randomBytes(24).toString("base64url");
  const place = await db.place.findUnique({ where: { id: input.placeId }, include: { parent: true } });

  const submission = await db.businessSubmission.create({
    data: {
      kind: "REGISTRATION",
      name: input.businessName.trim(),
      // The legacy string columns are still what the existing approval path reads, so they are filled in too.
      category: input.categoryIds[0] ?? "",
      area: place?.slug ?? "",
      description: input.description.trim(),
      address: input.address?.trim() || null,
      postcode: input.postcode.trim().toUpperCase() || null,
      phone: input.phone?.trim() || null,
      website: safeUrl(input.website) ?? null,
      submitterName: input.contactName.trim(),
      submitterEmail: input.contactEmail.trim().toLowerCase(),
      isOwner: true,
      ownerRole: input.contactRole.trim(),
      placeId: input.placeId,
      udprn: input.udprn || null,
      categoryIds: JSON.stringify(input.categoryIds),
      serviceAreaIds: JSON.stringify(input.serviceAreaIds),
      serviceAreaMode: input.serviceAreaMode,
      emailTokenHash: sha256(token),
      duplicateOfId: duplicateOfId ?? null,
    },
  });

  await audit({ action: "Business registration submitted", targetType: "BusinessSubmission", targetId: submission.id, detail: `${submission.name} by ${submission.submitterEmail}` }, { kind: "SYSTEM" });
  return { submission, token };
}

export type VerifyState = "ok" | "already" | "invalid";

/** Confirms the person controls the email address. The same bar claiming has to clear. */
export async function verifyRegistrationEmail(token: string): Promise<{ state: VerifyState; submissionId?: string; name?: string }> {
  const row = await db.businessSubmission.findFirst({ where: { emailTokenHash: sha256(token) } });
  if (!row) return { state: "invalid" };
  if (row.emailVerifiedAt) return { state: "already", submissionId: row.id, name: row.name };
  await db.businessSubmission.update({ where: { id: row.id }, data: { emailVerifiedAt: new Date() } });
  await audit({ action: "Registration email verified", targetType: "BusinessSubmission", targetId: row.id, detail: row.submitterEmail }, { kind: "SYSTEM" });
  return { state: "ok", submissionId: row.id, name: row.name };
}

/** What an administrator is allowed to do with this registration, and why. */
export function registrationEvidence(row: { emailVerifiedAt: Date | null; website: string | null; submitterEmail: string }) {
  const domainMatch = domainMatches(row.submitterEmail, websiteHost(row.website));
  // The same function claiming uses. Registering cannot be a softer route to VERIFIED than claiming is.
  const { canApprove, canVerify } = claimEvidence({ emailVerifiedAt: row.emailVerifiedAt, domainMatch, phoneVerifiedAt: null });
  return { canApprove, canVerify, domainMatch };
}

/**
 * Approves a registration: creates the listing, grants ownership, grants the welcome credits.
 *
 * Deliberately one function. Ownership goes through `grantOwnership()` and the credits are granted here,
 * after it — never at submission, because five free credits tied to an unverified email address is a thing
 * to be farmed rather than a feature.
 */
export type ApproveResult = {
  error?: string;
  /** The full row, so a caller can check what was actually created rather than a trimmed shape. */
  business?: Business;
  owner?: Owner;
  credits?: { granted: boolean; credits?: number; balance: number };
};

export async function approveRegistration(submissionId: string, opts: { verified: boolean; reviewedBy: string }): Promise<ApproveResult> {
  const row = await db.businessSubmission.findUnique({ where: { id: submissionId }, include: { place: { include: { parent: true } } } });
  if (!row) return { error: "That registration no longer exists." };
  if (row.status !== "PENDING") return { error: "That registration has already been handled." };

  const evidence = registrationEvidence(row);
  if (!evidence.canApprove) return { error: "The email address has not been verified yet, so there is nothing proving we can reach this person." };
  if (opts.verified && !evidence.canVerify) return { error: "There is not enough evidence to mark this verified: that needs a business-domain email or a phone call-back." };

  // The legacy Location the directory still routes on.
  const place = row.place;
  const locationId = place?.legacyLocationId
    ?? (place?.parentId ? (await db.place.findUnique({ where: { id: place.parentId }, select: { legacyLocationId: true } }))?.legacyLocationId : null);
  if (!locationId) return { error: "That location is not yet mapped to a directory area, so a listing cannot be created there." };

  const categoryIds: string[] = (() => { try { return JSON.parse(row.categoryIds ?? "[]"); } catch { return []; } })();
  const serviceAreaIds: string[] = (() => { try { return JSON.parse(row.serviceAreaIds ?? "[]"); } catch { return []; } })();
  const primaryCategoryId = categoryIds[0];
  if (!primaryCategoryId) return { error: "No service category was recorded on this registration." };

  const location = await db.location.findUnique({ where: { id: locationId }, select: { cityId: true } });
  if (!location) return { error: "That directory area no longer exists." };

  const business = await db.business.create({
    data: {
      slug: await uniqueSlug(row.name),
      name: row.name,
      summary: row.description.slice(0, 155),
      description: row.description,
      cityId: location.cityId,
      locationId,
      placeId: row.placeId,
      categoryId: primaryCategoryId,
      address: row.address, postcode: row.postcode, phone: row.phone,
      website: row.website, websiteHost: websiteHost(row.website),
      normName: normName(row.name),
      source: `Registered by the owner on ${new Date().toISOString().slice(0, 10)}`,
      claimStatus: opts.verified ? "VERIFIED" : "CLAIMED",
      published: true,
      ownerUpdatedAt: new Date(),
    },
  });

  if (categoryIds.length) {
    await db.businessCategory.createMany({
      data: categoryIds.map((categoryId, i) => ({ businessId: business.id, categoryId, isPrimary: i === 0 })),
      skipDuplicates: true,
    });
  }
  if (serviceAreaIds.length) {
    await db.businessServiceArea.createMany({
      data: serviceAreaIds.map((placeId) => ({ businessId: business.id, placeId, mode: row.serviceAreaMode })),
      skipDuplicates: true,
    });
  }

  // The one primitive. Both registration and claiming come through here.
  const owner = await grantOwnership({ id: row.id, businessId: business.id, email: row.submitterEmail, name: row.submitterName });

  // Credits only now: after ownership, on a verified email address.
  const credits = await grantWelcomeCredits(business.id, `Welcome grant on registration of ${business.name}`);

  await db.businessSubmission.update({
    where: { id: row.id },
    data: { status: "APPROVED", businessId: business.id, reviewedBy: opts.reviewedBy, reviewNote: opts.verified ? "Approved and verified" : "Approved" },
  });

  await audit({
    action: "Business registration approved",
    targetType: "Business", targetId: business.id,
    detail: `${business.name}, owner ${owner.email}, ${credits.granted ? `${credits.credits} welcome credits` : "no credits (already granted)"}${opts.verified ? ", verified" : ""}`,
  });

  return { business, owner, credits };
}

export async function rejectRegistration(submissionId: string, reason: string, reviewedBy: string): Promise<{ error?: string; ok?: true }> {
  if (reason.trim().length < 5) return { error: "Give a reason: the person is told why." };
  const row = await db.businessSubmission.findUnique({ where: { id: submissionId } });
  if (!row || row.status !== "PENDING") return { error: "That registration has already been handled." };
  await db.businessSubmission.update({ where: { id: submissionId }, data: { status: "REJECTED", reviewedBy, reviewNote: reason.trim() } });
  await audit({ action: "Business registration rejected", targetType: "BusinessSubmission", targetId: submissionId, detail: reason.trim() });
  return { ok: true };
}
