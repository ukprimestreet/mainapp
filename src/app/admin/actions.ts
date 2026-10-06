"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminConfigured, clearFails, clearSession, clientKey, emailOk, passwordOk, recordFail, requireAdmin, setSession, throttled } from "@/lib/auth";
import { findDuplicate, normName, safeUrl, slugify, uniqueSlug, websiteHost } from "@/lib/business";
import { createRedirect } from "@/lib/redirects";
import { refreshGeo } from "@/lib/geo-db";
import { bizPath } from "@/lib/queries";
import { db } from "@/lib/db";
import { runImport, type ImportReport } from "@/lib/importer";

const back = (path: string, msg: string): never => redirect(`${path}?msg=${encodeURIComponent(msg)}`);
const audit = (action: string, targetType: string, targetId: string, detail?: string) => db.auditLog.create({ data: { action, targetType, targetId, detail } });

export async function login(_: { error?: string }, fd: FormData): Promise<{ error?: string }> {
  if (!adminConfigured()) return { error: "Admin login is not configured on this server." };
  const key = await clientKey();
  if (throttled(key)) return { error: "Too many attempts. Try again in 15 minutes." };
  // both are always evaluated so timing doesn't reveal which one was wrong
  const okEmail = emailOk(String(fd.get("email") ?? "")), okPass = passwordOk(String(fd.get("password") ?? ""));
  if (!(okEmail && okPass)) { recordFail(key); return { error: "Incorrect email or password." }; }
  clearFails(key);
  await setSession();
  redirect("/admin");
}
export async function logout() { await clearSession(); redirect("/admin/login"); }

export async function decideSubmission(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id")), decision = String(fd.get("decision"));
  const s = await db.businessSubmission.findUnique({ where: { id } });
  if (!s || s.status !== "PENDING") return back("/admin/submissions", "Submission not found or already handled");
  if (decision === "REJECT") {
    await db.businessSubmission.update({ where: { id }, data: { status: "REJECTED" } });
    await audit("SUBMISSION_REJECT", "BusinessSubmission", id);
    return back("/admin/submissions", "Rejected");
  }
  const [cat, loc, city] = await Promise.all([db.category.findUnique({ where: { slug: s.category } }), db.location.findUnique({ where: { slug: s.area } }), db.city.findUnique({ where: { slug: "london" } })]);
  if (!cat || !loc || !city) return back("/admin/submissions", "Category or area no longer exists");
  const dupe = await findDuplicate({ name: s.name, locationId: loc.id, phone: s.phone, website: s.website });
  if (dupe) return back("/admin/submissions", `Looks like a duplicate of "${dupe.business.name}" — reject it or edit that profile`);
  const slug = await uniqueSlug(s.name);
  const b = await db.business.create({
    data: {
      slug, name: s.name, summary: s.description.slice(0, 150), description: s.description, cityId: city.id, locationId: loc.id, categoryId: cat.id,
      address: s.address, postcode: s.postcode, phone: s.phone, website: safeUrl(s.website), websiteHost: websiteHost(s.website), normName: normName(s.name),
      areasServed: loc.name, source: `Public submission (${s.isOwner ? "by owner" : "by third party"})`, claimStatus: "UNCLAIMED", isSample: false, published: true,
    },
  });
  await db.businessSubmission.update({ where: { id }, data: { status: "APPROVED", businessId: b.id } });
  await audit("SUBMISSION_APPROVE", "BusinessSubmission", id, slug);
  revalidatePath("/", "layout");
  back("/admin/submissions", `Approved → created unclaimed profile "${s.name}"`);
}

const editSchema = z.object({
  id: z.string(), name: z.string().trim().min(2).max(120), summary: z.string().trim().min(10).max(160), description: z.string().trim().min(40).max(3000),
  phone: z.string().trim().max(30).optional(), website: z.string().trim().optional(), address: z.string().trim().max(200).optional(), postcode: z.string().trim().max(10).optional(),
  slug: z.string().trim().optional(), imageUrl: z.string().trim().optional(), services: z.string().trim().optional(), hours: z.string().trim().optional(),
});
export async function updateBusiness(fd: FormData) {
  await requireAdmin();
  const p = editSchema.safeParse(Object.fromEntries(fd));
  const id = String(fd.get("id"));
  if (!p.success) return back(`/admin/businesses/${id}`, `Invalid: ${p.error.issues.map((i) => `${String(i.path[0])} ${i.message}`).join("; ")}`);
  const d = p.data;
  if (d.website && !safeUrl(d.website)) return back(`/admin/businesses/${id}`, "Website must be a valid http(s) URL");
  if (d.imageUrl && !safeUrl(d.imageUrl)) return back(`/admin/businesses/${id}`, "Image must be a valid http(s) URL");
  let hours: string | null = null;
  if (d.hours) { try { const j = JSON.parse(d.hours); if (typeof j !== "object" || Array.isArray(j)) throw 0; hours = JSON.stringify(j); } catch { return back(`/admin/businesses/${id}`, 'Opening hours must be JSON like {"mon":"09:00-17:00"}'); } }
  const before = await db.business.findUnique({ where: { id }, include: { city: true, category: true } });
  let newSlug: string | undefined;
  if (d.slug && before && d.slug !== before.slug) {
    if (d.slug !== slugify(d.slug)) return back(`/admin/businesses/${id}`, "Slug may only contain lowercase letters, numbers and hyphens");
    if (await db.business.findUnique({ where: { slug: d.slug } })) return back(`/admin/businesses/${id}`, "That slug is already used by another business");
    newSlug = d.slug;
  }
  await db.business.update({
    where: { id },
    data: {
      ...(newSlug ? { slug: newSlug } : {}),
      name: d.name, normName: normName(d.name), summary: d.summary, description: d.description, phone: d.phone || null, address: d.address || null, postcode: d.postcode || null,
      website: safeUrl(d.website), websiteHost: websiteHost(d.website), imageUrl: safeUrl(d.imageUrl), openingHours: hours, ownedByFounder: fd.get("ownedByFounder") === "on",
      services: d.services ? JSON.stringify(d.services.split(",").map((s) => s.trim()).filter(Boolean)) : null,
    },
  });
  if (before && (before.postcode ?? "") !== (d.postcode || "")) await refreshGeo(id).catch(() => {}); // coordinates follow the postcode
  if (newSlug && before) await createRedirect(bizPath(before), bizPath({ ...before, slug: newSlug }), "Business URL changed");
  await audit("BUSINESS_UPDATE", "Business", id);
  revalidatePath("/", "layout");
  back(`/admin/businesses/${id}`, "Saved");
}

export async function setPublished(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id")), published = fd.get("published") === "1";
  await db.business.update({ where: { id }, data: { published } });
  await audit(published ? "BUSINESS_PUBLISH" : "BUSINESS_UNPUBLISH", "Business", id);
  revalidatePath("/", "layout");
  back("/admin/businesses", published ? "Published" : "Unpublished");
}

/** Hard delete is only allowed for sample data without dependants; real profiles are unpublished instead. */
export async function deleteSampleBusinesses() {
  await requireAdmin();
  const sample = await db.business.findMany({ where: { isSample: true }, select: { id: true } });
  const ids = sample.map((b) => b.id);
  await db.articleBusiness.deleteMany({ where: { businessId: { in: ids } } });
  await db.podcastEpisode.updateMany({ where: { businessId: { in: ids } }, data: { businessId: null } });
  await db.claimRequest.deleteMany({ where: { businessId: { in: ids } } });
  await db.review.deleteMany({ where: { businessId: { in: ids } } });
  const r = await db.business.deleteMany({ where: { id: { in: ids } } });
  await audit("SAMPLE_BUSINESSES_DELETED", "Business", "*", String(r.count));
  revalidatePath("/", "layout");
  back("/admin/businesses", `Deleted ${r.count} sample businesses`);
}

export async function importCsv(_: ImportReport | { error: string } | null, fd: FormData): Promise<ImportReport | { error: string }> {
  await requireAdmin();
  const file = fd.get("file");
  const text = file instanceof File && file.size > 0 ? await file.text() : String(fd.get("csv") ?? "");
  if (!text.trim()) return { error: "Upload a CSV file or paste CSV text." };
  if (text.length > 2_000_000) return { error: "CSV too large (2MB max)." };
  const report = await runImport(text, { dryRun: fd.get("apply") !== "1" });
  if (!report.dryRun) revalidatePath("/", "layout");
  return report;
}
