"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { safeUrl } from "@/lib/business";
import { MAX_GALLERY, isPremium } from "@/lib/commerce";
import { createCheckout, createPortal, billingConfigured } from "@/lib/billing";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { requireBusiness } from "@/lib/owner";
import { SITE } from "@/lib/constants";

export type CState = { ok?: boolean; message?: string; errors?: Record<string, string> };
const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** Start an online purchase (Stripe Checkout). Authorises against the business first. */
export async function buyProduct(_: CState, fd: FormData): Promise<CState> {
  const { owner, business } = await requireBusiness(s(fd, "id"));
  if (business.isSample) return { message: "Sample businesses can't buy products." };
  const r = await createCheckout({
    productKey: s(fd, "product"), businessId: business.id, ownerId: owner.id, ownerEmail: owner.email,
    successUrl: `${SITE.url}/owner/business/${business.id}/promote?paid=1`, cancelUrl: `${SITE.url}/owner/business/${business.id}/promote?cancelled=1`,
  });
  if ("error" in r) return { message: r.error };
  redirect(r.url);
}

/** When online payment isn't available, the owner asks for the product and the team follows up (invoice / manual activation). */
export async function requestProduct(_: CState, fd: FormData): Promise<CState> {
  const { owner, business } = await requireBusiness(s(fd, "id"));
  const product = await db.product.findUnique({ where: { key: s(fd, "product") } });
  if (!product) return { message: "Unknown product." };
  if ((await db.salesEnquiry.count({ where: { email: owner.email, businessId: business.id, createdAt: { gte: new Date(Date.now() - 86400_000) } } })) >= 2) return { ok: true, message: "We already have your request and will be in touch." };
  const row = await db.salesEnquiry.create({ data: { name: owner.name, email: owner.email, interest: product.kind === "PREMIUM" ? "premium" : "featured", message: `Owner of ${business.name} requested “${product.name}”.`, businessId: business.id } });
  const admin = (process.env.ADMIN_EMAIL ?? "").trim();
  if (admin) await sendMail(admin, `Product request: ${product.name} for ${business.name}`, `${owner.name} <${owner.email}> asked for “${product.name}” for ${business.name}.\n(Enquiry ${row.id})`);
  return { ok: true, message: "Thanks — we'll send you an invoice or payment link shortly." };
}

export async function openBillingPortal(fd: FormData) {
  const { business } = await requireBusiness(s(fd, "id"));
  const sub = await db.subscription.findFirst({ where: { businessId: business.id, provider: "STRIPE", stripeCustomerId: { not: null } }, orderBy: { createdAt: "desc" } });
  if (!sub?.stripeCustomerId || !billingConfigured()) redirect(`/owner/business/${business.id}/promote?msg=${encodeURIComponent("Billing portal isn't available for this plan")}`);
  const r = await createPortal(sub.stripeCustomerId, `${SITE.url}/owner/business/${business.id}/promote`);
  if ("error" in r) redirect(`/owner/business/${business.id}/promote?msg=${encodeURIComponent(r.error)}`);
  redirect(r.url);
}

/** Premium-only settings: gallery and offer banner. Edits are logged so an admin can revert. */
export async function savePremiumSettings(_: CState, fd: FormData): Promise<CState> {
  const { owner, business } = await requireBusiness(s(fd, "id"));
  if (!(await isPremium(business.id))) return { message: "These features need a Premium plan." };
  const errors: Record<string, string> = {};
  const urls = s(fd, "gallery").split("\n").map((x) => x.trim()).filter(Boolean);
  if (urls.length > MAX_GALLERY) errors.gallery = `At most ${MAX_GALLERY} images`;
  const clean: string[] = [];
  for (const u of urls) { const v = safeUrl(u); if (!v || !v.startsWith("https://")) { errors.gallery = `“${u.slice(0, 40)}” isn't a valid https image address`; break; } if (!clean.includes(v)) clean.push(v); }
  const promoText = s(fd, "promoText"), promoUrl = s(fd, "promoUrl");
  if (promoText.length > 140) errors.promoText = "Keep the offer to 140 characters";
  if (promoUrl && !safeUrl(promoUrl)) errors.promoUrl = "Must be a valid web address";
  if (/<|>/.test(promoText)) errors.promoText = "No HTML please";
  if (Object.keys(errors).length) return { errors, message: "Please fix the highlighted fields." };
  const next = { gallery: clean.length ? JSON.stringify(clean) : null, promoText: promoText || null, promoUrl: promoUrl ? safeUrl(promoUrl) : null };
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, to] of Object.entries(next)) { const from = (business as Record<string, unknown>)[k] ?? null; if (from !== to) changes[k] = { from, to }; }
  if (!Object.keys(changes).length) return { ok: true, message: "No changes to save." };
  await db.$transaction([db.business.update({ where: { id: business.id }, data: { ...next, ownerUpdatedAt: new Date() } }), db.businessEditLog.create({ data: { businessId: business.id, ownerId: owner.id, changes: JSON.stringify(changes) } })]);
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved. Your profile is updated." };
}

export async function setLeadStatus(fd: FormData) {
  const lead = await db.lead.findUnique({ where: { id: s(fd, "leadId") } });
  if (!lead) redirect("/owner");
  const { business } = await requireBusiness(lead.businessId); // authorisation via the lead's business
  const status = s(fd, "status");
  if (["READ", "ARCHIVED", "NEW"].includes(status)) await db.lead.update({ where: { id: lead.id }, data: { status } });
  redirect(`/owner/business/${business.id}/leads`);
}
