"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { safeUrl } from "@/lib/business";
import { db } from "@/lib/db";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const back = (to: string, msg: string): never => redirect(`${to}?msg=${encodeURIComponent(msg)}`);
const audit = (action: string, targetType: string, targetId: string, detail?: string) => db.auditLog.create({ data: { action, targetType, targetId, detail } });
const date = (v: string) => { const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null; return d && !isNaN(d.getTime()) ? d : null; };
const endOfDay = (d: Date) => new Date(d.getTime() + 86400_000 - 1);

// ---------------------------------------------------------------- products
export async function saveProduct(fd: FormData) {
  await requireAdmin();
  const P = "/admin/commerce";
  const id = s(fd, "id");
  const p = await db.product.findUnique({ where: { id } });
  if (!p) return back(P, "Product not found");
  const name = s(fd, "name"), description = s(fd, "description");
  const price = Math.round(parseFloat(s(fd, "priceGbp") || "0") * 100);
  const active = fd.get("active") === "on";
  const duration = s(fd, "durationDays") ? parseInt(s(fd, "durationDays"), 10) : null;
  if (name.length < 3 || description.length < 10) return back(P, `${p.name}: name and description are required`);
  if (!Number.isFinite(price) || price < 0 || price > 1_000_000) return back(P, `${p.name}: price must be between £0 and £10,000`);
  if (active && price <= 0) return back(P, `${p.name}: set a real price before activating — nothing is sold at £0`);
  if (p.kind === "FEATURED" && (!duration || duration < 1 || duration > 365)) return back(P, `${p.name}: duration must be 1–365 days`);
  await db.product.update({ where: { id }, data: { name, description, pricePence: price, active, durationDays: p.kind === "FEATURED" ? duration : null, stripePriceId: s(fd, "stripePriceId") || null } });
  await audit("PRODUCT_SAVED", "Product", id, `${p.key} price=${price} active=${active}`);
  revalidatePath("/", "layout");
  back(P, `${name} saved${active ? " and live on /advertise" : " (not live)"}`);
}

// ---------------------------------------------------------------- manual premium
export async function grantPremium(fd: FormData) {
  await requireAdmin();
  const P = "/admin/commerce/subscriptions";
  const b = await db.business.findUnique({ where: { slug: s(fd, "slug") } });
  if (!b) return back(P, "Business not found (use its slug)");
  if (b.isSample) return back(P, "Sample businesses can't be given paid plans");
  const end = date(s(fd, "until"));
  if (!end || end.getTime() < Date.now()) return back(P, "Choose an end date in the future");
  const note = s(fd, "note").slice(0, 300);
  if (note.length < 3) return back(P, "Add a note (e.g. invoice number) so there's a record of why");
  const sub = await db.subscription.create({ data: { businessId: b.id, productKey: "premium_monthly", provider: "MANUAL", status: "ACTIVE", currentPeriodEnd: endOfDay(end), note } });
  await audit("PREMIUM_GRANTED", "Subscription", sub.id, `${b.slug} until ${s(fd, "until")}: ${note}`);
  revalidatePath("/", "layout");
  back(P, `Premium granted to ${b.name} until ${s(fd, "until")}`);
}
export async function revokeSubscription(fd: FormData) {
  await requireAdmin();
  const sub = await db.subscription.update({ where: { id: s(fd, "id") }, data: { status: "CANCELED" } }).catch(() => null);
  if (sub) await audit("SUBSCRIPTION_REVOKED", "Subscription", sub.id);
  revalidatePath("/", "layout");
  back("/admin/commerce/subscriptions", sub ? "Subscription ended" : "Not found");
}

// ---------------------------------------------------------------- campaigns
export async function createCampaign(fd: FormData) {
  await requireAdmin();
  const P = "/admin/commerce/campaigns";
  const kind = s(fd, "kind");
  const start = date(s(fd, "startsAt")) ?? new Date(), end = date(s(fd, "endsAt"));
  if (!end || endOfDay(end) <= start) return back(P, "Choose an end date after the start date");
  if (endOfDay(end).getTime() - start.getTime() > 400 * 86400_000) return back(P, "Campaigns can run for at most 400 days");
  const cap = s(fd, "impressionCap") ? parseInt(s(fd, "impressionCap"), 10) : null;
  if (cap !== null && (!Number.isFinite(cap) || cap < 100)) return back(P, "Impression cap must be 100 or more (or blank)");
  const categoryId = s(fd, "categoryId") || null, locationId = s(fd, "locationId") || null;
  if (kind === "FEATURED") {
    const b = await db.business.findUnique({ where: { slug: s(fd, "slug") } });
    if (!b) return back(P, "Business not found (use its slug)");
    if (b.isSample) return back(P, "Sample (fictional) businesses can't be promoted");
    if (!b.published) return back(P, "Unpublished businesses can't be promoted");
    const c = await db.campaign.create({ data: { kind: "FEATURED", businessId: b.id, categoryId, locationId, startsAt: start, endsAt: endOfDay(end), impressionCap: cap, placement: "LISTING" } });
    await audit("CAMPAIGN_CREATED", "Campaign", c.id, `featured ${b.slug}`);
    return back(P, `Featured campaign created for ${b.name}${b.ownedByFounder ? " — it will carry a founder-ownership disclosure" : ""}`);
  }
  if (kind === "AD") {
    const headline = s(fd, "headline"), body = s(fd, "body"), advertiser = s(fd, "advertiser"), link = safeUrl(s(fd, "linkUrl")), image = s(fd, "imageUrl") ? safeUrl(s(fd, "imageUrl")) : null;
    const placement = s(fd, "placement");
    if (advertiser.length < 2) return back(P, "Name the advertiser");
    if (headline.length < 5 || headline.length > 90) return back(P, "Headline must be 5–90 characters");
    if (body.length > 200) return back(P, "Body is over 200 characters");
    if (/<|>/.test(headline + body)) return back(P, "No HTML in ad copy");
    if (!link || !link.startsWith("https://")) return back(P, "Destination must be an https address");
    if (s(fd, "imageUrl") && (!image || !image.startsWith("https://"))) return back(P, "Image must be an https address");
    if (!["HOME", "ARTICLE", "PODCAST"].includes(placement)) return back(P, "Choose a placement");
    const c = await db.campaign.create({ data: { kind: "AD", advertiser, headline, body: body || null, imageUrl: image, linkUrl: link, placement, categoryId: null, locationId: null, startsAt: start, endsAt: endOfDay(end), impressionCap: cap } });
    await audit("CAMPAIGN_CREATED", "Campaign", c.id, `ad ${advertiser}`);
    return back(P, `Ad created for ${advertiser}`);
  }
  back(P, "Choose a campaign type");
}
export async function setCampaignStatus(fd: FormData) {
  await requireAdmin();
  const st = s(fd, "status");
  if (!["ACTIVE", "PAUSED", "ENDED"].includes(st)) return back("/admin/commerce/campaigns", "Unknown status");
  const c = await db.campaign.update({ where: { id: s(fd, "id") }, data: { status: st, ...(st === "ENDED" ? { endsAt: new Date() } : {}) } }).catch(() => null);
  if (c) await audit(`CAMPAIGN_${st}`, "Campaign", c.id);
  back("/admin/commerce/campaigns", c ? `Campaign ${st.toLowerCase()}` : "Not found");
}

// ---------------------------------------------------------------- sponsorship ledger
export async function saveSponsorship(fd: FormData) {
  await requireAdmin();
  const P = "/admin/commerce/sponsorships";
  const kind = s(fd, "kind"), name = s(fd, "sponsorName");
  if (!["PODCAST", "NEWSLETTER", "ARTICLE", "OTHER"].includes(kind)) return back(P, "Choose a type");
  if (name.length < 2) return back(P, "Name the sponsor");
  const price = Math.round(parseFloat(s(fd, "priceGbp") || "0") * 100);
  if (!Number.isFinite(price) || price < 0) return back(P, "Invalid price");
  const website = s(fd, "website") ? safeUrl(s(fd, "website")) : null;
  if (s(fd, "website") && !website) return back(P, "Website must be a valid address");
  let episodeId: string | null = null;
  if (kind === "PODCAST" && s(fd, "episodeSlug")) { const e = await db.podcastEpisode.findUnique({ where: { slug: s(fd, "episodeSlug") } }); if (!e) return back(P, "Episode not found (use its slug)"); episodeId = e.id; }
  if (kind === "PODCAST" && !episodeId) return back(P, "A podcast sponsorship needs an episode slug");
  const row = await db.sponsorship.create({ data: { kind, sponsorName: name, website, pricePence: price, status: s(fd, "status") === "ACTIVE" ? "ACTIVE" : "DRAFT", startsAt: date(s(fd, "startsAt")), endsAt: s(fd, "endsAt") ? endOfDay(date(s(fd, "endsAt")) ?? new Date()) : null, episodeId, notes: s(fd, "notes").slice(0, 300) || null } });
  await audit("SPONSORSHIP_CREATED", "Sponsorship", row.id, `${kind} ${name}`);
  revalidatePath("/", "layout");
  back(P, `Sponsorship saved (${row.status.toLowerCase()})`);
}
export async function updateSponsorship(fd: FormData) {
  await requireAdmin();
  const st = s(fd, "status");
  if (!["DRAFT", "ACTIVE", "DONE", "CANCELLED"].includes(st)) return back("/admin/commerce/sponsorships", "Unknown status");
  const data: Record<string, unknown> = { status: st };
  if (fd.has("invoiced")) data.invoiced = fd.get("invoiced") === "1";
  await db.sponsorship.update({ where: { id: s(fd, "id") }, data }).catch(() => null);
  revalidatePath("/", "layout");
  back("/admin/commerce/sponsorships", "Updated");
}

// ---------------------------------------------------------------- enquiries
export async function setEnquiryStatus(fd: FormData) {
  await requireAdmin();
  const st = s(fd, "status");
  if (["NEW", "CONTACTED", "WON", "LOST"].includes(st)) await db.salesEnquiry.update({ where: { id: s(fd, "id") }, data: { status: st } }).catch(() => null);
  back("/admin/commerce/enquiries", "Updated");
}
