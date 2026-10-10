"use server";

import { randomBytes } from "crypto";
import { redirect } from "next/navigation";
import { requireBusiness } from "@/lib/owner";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/antispam";
import { sendMail, siteLink } from "@/lib/mail";
import { getEntitlements, MAX_GALLERY } from "@/lib/commerce";

const s = (f: FormData, k: string) => ((f.get(k) as string | null) ?? "").toString();
const https = (u: string) => /^https:\/\/[^\s]+$/i.test(u.trim());

// ---------------------------------------------------------------- photos
export async function saveGallery(form: FormData) {
  const id = s(form, "businessId");
  const { business, owner } = await requireBusiness(id);
  const back = (m: string) => redirect(`/owner/business/${id}/photos?msg=${encodeURIComponent(m)}`);

  const ent = await getEntitlements(id);
  if (!ent.premium) back("A photo gallery is part of Premium.");

  const urls = (form.getAll("photo") as string[]).map((u) => u.trim()).filter(Boolean);
  if (urls.some((u) => !https(u))) back("Every photo must be an https image.");
  if (urls.length > MAX_GALLERY) back(`At most ${MAX_GALLERY} photos.`);

  await db.business.update({ where: { id }, data: { gallery: urls.length ? JSON.stringify([...new Set(urls)]) : null } });
  await db.businessEditLog.create({
    data: { businessId: id, ownerId: owner.id, changes: JSON.stringify({ gallery: { from: `${JSON.parse(business.gallery ?? "[]").length} photos`, to: `${urls.length} photos` } }) },
  });
  back(urls.length ? `Saved ${urls.length} ${urls.length === 1 ? "photo" : "photos"}.` : "Photos removed.");
}

export async function setCoverPhoto(form: FormData) {
  const id = s(form, "businessId");
  await requireBusiness(id);
  const url = s(form, "url").trim();
  const back = (m: string) => redirect(`/owner/business/${id}/photos?msg=${encodeURIComponent(m)}`);
  if (!https(url)) back("That is not a valid image.");
  await db.business.update({ where: { id }, data: { imageUrl: url } });
  back("Cover photo set. It is the first thing people see.");
}

// ---------------------------------------------------------------- offers
export async function saveOffer(form: FormData) {
  const id = s(form, "businessId");
  await requireBusiness(id);
  const back = (m: string) => redirect(`/owner/business/${id}/offers?msg=${encodeURIComponent(m)}`);
  const ent = await getEntitlements(id);
  if (!ent.premium) back("The offer banner is part of Premium.");

  const text = s(form, "promoText").trim(), url = s(form, "promoUrl").trim();
  if (text && text.length > 140) back("Keep the offer under 140 characters.");
  if (/<[a-z/]/i.test(text)) back("No HTML in the offer, please.");
  if (url && !https(url)) back("The offer link must be an https address.");

  await db.business.update({ where: { id }, data: { promoText: text || null, promoUrl: url || null } });
  back(text ? "Offer saved and live on your profile." : "Offer removed.");
}

// ---------------------------------------------------------------- opening hours
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveSpecialHours(form: FormData) {
  const id = s(form, "businessId");
  await requireBusiness(id);
  const back = (m: string) => redirect(`/owner/business/${id}/hours?msg=${encodeURIComponent(m)}`);
  const day = s(form, "day"), closed = s(form, "closed") === "1";
  const opens = s(form, "opens").trim(), closes = s(form, "closes").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) back("Choose a date.");
  if (!closed && (!HHMM.test(opens) || !HHMM.test(closes))) back("Give an opening and closing time, or tick closed.");
  if (!closed && opens >= closes) back("The closing time must be after the opening time.");

  await db.specialHours.upsert({
    where: { businessId_day: { businessId: id, day } },
    create: { businessId: id, day, closed, opens: closed ? null : opens, closes: closed ? null : closes, note: s(form, "note").trim() || null },
    update: { closed, opens: closed ? null : opens, closes: closed ? null : closes, note: s(form, "note").trim() || null },
  });
  back(`Saved special hours for ${day}.`);
}

export async function removeSpecialHours(form: FormData) {
  const id = s(form, "businessId");
  await requireBusiness(id);
  await db.specialHours.delete({ where: { id: s(form, "id") } }).catch(() => {});
  redirect(`/owner/business/${id}/hours?msg=${encodeURIComponent("Removed.")}`);
}

// ---------------------------------------------------------------- team
export async function inviteTeammate(form: FormData) {
  const id = s(form, "businessId");
  const { business, owner } = await requireBusiness(id);
  const back = (m: string) => redirect(`/owner/business/${id}/team?msg=${encodeURIComponent(m)}`);
  const email = s(form, "email").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(email)) back("Enter a valid email address.");

  const already = await db.businessOwner.findFirst({ where: { businessId: id, owner: { email } } });
  if (already) back("They already manage this business.");

  const raw = randomBytes(18).toString("base64url");
  await db.teamInvite.create({
    data: { businessId: id, email, invitedBy: owner.email, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 7 * 86400_000) },
  });
  await sendMail(
    email,
    `${owner.name} has asked you to help manage ${business.name}`,
    [
      `${owner.name} manages ${business.name} on PrimeStreet and would like you to help.`,
      "",
      "Accepting lets you edit the profile, reply to reviews and see enquiries.",
      "",
      siteLink(`/owner/team/${raw}`),
      "",
      "The link works once and expires in seven days.",
    ].join("\n"),
    { purpose: "claims" },
  );
  back(`Invitation sent to ${email}.`);
}

export async function cancelInvite(form: FormData) {
  const id = s(form, "businessId");
  await requireBusiness(id);
  await db.teamInvite.delete({ where: { id: s(form, "id") } }).catch(() => {});
  redirect(`/owner/business/${id}/team?msg=${encodeURIComponent("Invitation cancelled.")}`);
}

/** Removing the last manager would orphan the listing, so it is refused. */
export async function removeTeammate(form: FormData) {
  const id = s(form, "businessId");
  const { owner } = await requireBusiness(id);
  const back = (m: string) => redirect(`/owner/business/${id}/team?msg=${encodeURIComponent(m)}`);
  const ownerId = s(form, "ownerId");

  const count = await db.businessOwner.count({ where: { businessId: id } });
  if (count <= 1) back("You cannot remove the only manager — the listing would be left with nobody.");
  if (ownerId === owner.id) back("You cannot remove yourself. Ask another manager to do it.");

  const person = await db.owner.findUnique({ where: { id: ownerId } });
  await db.businessOwner.deleteMany({ where: { businessId: id, ownerId } });
  await db.auditLog.create({ data: { action: "Team member removed", targetType: "Business", targetId: id, detail: `${person?.email ?? ownerId} by ${owner.email}` } });
  back(`${person?.name ?? "They"} no longer manage this business.`);
}
