"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { EDITOR_ROLES, validateArea, validateCity } from "@/lib/cities";
import { createRedirect } from "@/lib/redirects";


const audit = (action: string, targetType: string, targetId: string, detail?: string) => db.auditLog.create({ data: { action, targetType, targetId, detail } });

const back = (path: string, msg: string) => redirect(`${path}?msg=${encodeURIComponent(msg)}`);
const str = (f: FormData, k: string) => (f.get(k) as string | null)?.toString() ?? "";

export async function saveCity(form: FormData) {
  await requireAdmin();
  const id = str(form, "id");
  const v = validateCity({
    name: str(form, "name"), slug: str(form, "slug") || str(form, "name"), status: str(form, "status"),
    intro: str(form, "intro"), lat: str(form, "lat"), lng: str(form, "lng"), prefixes: str(form, "prefixes"),
  });
  if (!v.ok) back("/admin/cities", Object.values(v.errors)[0]);
  const existing = id ? await db.city.findUnique({ where: { id } }) : null;
  if (id && !existing) back("/admin/cities", "That city no longer exists.");
  const clash = await db.city.findUnique({ where: { slug: v.value.slug } });
  if (clash && clash.id !== id) back("/admin/cities", `Another city already uses the address "${v.value.slug}".`);

  // Launching a city is an editorial promise: it needs real businesses and an intro before the public sees it as live.
  if (v.value.status === "LIVE" && existing?.status !== "LIVE") {
    const real = await db.business.count({ where: { cityId: id, published: true, isSample: false } });
    if (!id || real === 0) back("/admin/cities", "Add real published businesses before launching a city.");
    if ((v.value.intro ?? "").length < 100) back("/admin/cities", "Write an intro of 100+ characters before launching a city.");
  }
  const data = { ...v.value, region: str(form, "region").trim() || null, sortOrder: Number(str(form, "sortOrder")) || 0, active: form.get("active") === "on" };
  if (existing) {
    if (existing.slug !== v.value.slug) await createRedirect(`/locations/${existing.slug}`, `/locations/${v.value.slug}`, "City address changed in admin");
    await db.city.update({ where: { id }, data: { ...data, launchedAt: data.status === "LIVE" ? existing.launchedAt ?? new Date() : existing.launchedAt } });
    await audit("City updated", "City", id, data.name);
  } else {
    const created = await db.city.create({ data: { ...data, launchedAt: data.status === "LIVE" ? new Date() : null } });
    await audit("City created", "City", created.id, data.name);
  }
  revalidatePath("/locations");
  back("/admin/cities", existing ? `Saved ${data.name}.` : `Added ${data.name}. It stays out of the index until it has real businesses and an intro.`);
}

export async function saveArea(form: FormData) {
  await requireAdmin();
  const cityId = str(form, "cityId"), id = str(form, "id");
  const city = await db.city.findUnique({ where: { id: cityId } });
  if (!city) back("/admin/cities", "Choose a city for the area.");
  const v = validateArea({ name: str(form, "name"), slug: str(form, "slug") || str(form, "name"), kind: str(form, "kind"), intro: str(form, "intro"), parentId: str(form, "parentId") || null });
  if (!v.ok) back(`/admin/cities/${city!.slug}`, Object.values(v.errors)[0]);
  if (v.value.parentId) {
    const parent = await db.location.findUnique({ where: { id: v.value.parentId } });
    if (!parent || parent.cityId !== cityId) back(`/admin/cities/${city!.slug}`, "The borough must be in the same city.");
    if (parent!.kind !== "BOROUGH") back(`/admin/cities/${city!.slug}`, "Neighbourhoods sit inside a borough, not inside another neighbourhood.");
    if (parent!.id === id) back(`/admin/cities/${city!.slug}`, "An area can't sit inside itself.");
  }
  const existing = id ? await db.location.findUnique({ where: { id } }) : null;
  const clash = await db.location.findUnique({ where: { cityId_slug: { cityId, slug: v.value.slug } } });
  if (clash && clash.id !== id) back(`/admin/cities/${city!.slug}`, `${city!.name} already has an area at "${v.value.slug}".`);
  if (existing) {
    if (existing.slug !== v.value.slug) await createRedirect(`/locations/${city!.slug}/${existing.slug}`, `/locations/${city!.slug}/${v.value.slug}`, "Area address changed in admin");
    await db.location.update({ where: { id }, data: v.value });
    await audit("Area updated", "Location", id, `${v.value.name}, ${city!.name}`);
  } else {
    const created = await db.location.create({ data: { ...v.value, cityId } });
    await audit("Area created", "Location", created.id, `${v.value.name}, ${city!.name}`);
  }
  back(`/admin/cities/${city!.slug}`, existing ? `Saved ${v.value.name}.` : `Added ${v.value.name}.`);
}

export async function setTeam(form: FormData) {
  await requireAdmin();
  const cityId = str(form, "cityId"), authorId = str(form, "authorId"), role = str(form, "role");
  const [city, author] = await Promise.all([db.city.findUnique({ where: { id: cityId } }), db.author.findUnique({ where: { id: authorId } })]);
  if (!city) back("/admin/cities", "That city no longer exists.");
  if (str(form, "remove") === "1") {
    await db.cityEditor.deleteMany({ where: { cityId, authorId } });
    await audit("City team member removed", "City", cityId, `${author?.name ?? authorId} from ${city!.name}`);
    back(`/admin/cities/${city!.slug}`, "Removed from the team.");
  }
  if (!author) back(`/admin/cities/${city!.slug}`, "Choose a writer to add.");
  if (!(role in EDITOR_ROLES)) back(`/admin/cities/${city!.slug}`, "Choose a role.");
  await db.cityEditor.upsert({ where: { cityId_authorId: { cityId, authorId } }, create: { cityId, authorId, role }, update: { role } });
  await audit("City team set", "City", cityId, `${author!.name} - ${role} for ${city!.name}`);
  back(`/admin/cities/${city!.slug}`, `${author!.name} covers ${city!.name}.`);
}
