"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { createRedirect, normalisePath } from "@/lib/redirects";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const audit = (action: string, targetId: string, detail?: string) => db.auditLog.create({ data: { action, targetType: "Seo", targetId, detail } });
const RESERVED = ["/admin", "/owner", "/api", "/_next"];

export type SeoState = { ok?: boolean; message?: string; errors?: Record<string, string> };

export async function saveSeoPage(_: SeoState, fd: FormData): Promise<SeoState> {
  await requireAdmin();
  const path = normalisePath(s(fd, "path"));
  const title = s(fd, "title"), description = s(fd, "description"), intro = String(fd.get("intro") ?? "").replace(/\r\n/g, "\n").trim(), robots = s(fd, "robots") || "AUTO";
  const errors: Record<string, string> = {};
  if (!path || RESERVED.some((r) => path.startsWith(r))) errors.path = "Invalid path";
  if (title.length > 70) errors.title = "Title is over 70 characters";
  if (description.length > 160) errors.description = "Description is over 160 characters";
  if (intro.length > 3000) errors.intro = "Intro is over 3000 characters";
  if (!["AUTO", "INDEX", "NOINDEX"].includes(robots)) errors.robots = "Choose AUTO, INDEX or NOINDEX";
  if (Object.keys(errors).length) return { errors, message: "Please fix the highlighted fields." };
  if (!title && !description && !intro && robots === "AUTO") { await db.seoPage.deleteMany({ where: { path } }); }
  else await db.seoPage.upsert({ where: { path }, create: { path, title: title || null, description: description || null, intro: intro || null, robots }, update: { title: title || null, description: description || null, intro: intro || null, robots } });
  await audit("SEO_PAGE_SAVED", path, `robots=${robots}`);
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved. The page and the sitemap use these settings immediately." };
}

export async function deleteSeoPage(fd: FormData) {
  await requireAdmin();
  const path = normalisePath(s(fd, "path"));
  await db.seoPage.deleteMany({ where: { path } });
  await audit("SEO_PAGE_RESET", path);
  revalidatePath("/", "layout");
  redirect(`/admin/seo?msg=${encodeURIComponent("Reset to automatic")}`);
}

export async function addRedirect(_: SeoState, fd: FormData): Promise<SeoState> {
  await requireAdmin();
  const r = await createRedirect(s(fd, "from"), s(fd, "to"), s(fd, "note").slice(0, 200));
  if (!r.ok) return { errors: { from: r.error }, message: r.error };
  await audit("REDIRECT_CREATED", r.from, `→ ${r.to}`);
  revalidatePath("/admin/seo/redirects");
  return { ok: true, message: `Redirect saved: ${r.from} → ${r.to}` };
}

export async function deleteRedirect(fd: FormData) {
  await requireAdmin();
  const id = s(fd, "id");
  const r = await db.redirect.delete({ where: { id } }).catch(() => null);
  if (r) await audit("REDIRECT_DELETED", r.fromPath, `→ ${r.toPath}`);
  redirect(`/admin/seo/redirects?msg=${encodeURIComponent("Redirect deleted")}`);
}

