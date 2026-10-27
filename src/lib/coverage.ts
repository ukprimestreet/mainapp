import { audit, type Actor } from "./audit";
import { db } from "./db";

/**
 * What a business covers: the areas it will travel to, the trades it offers, and whether it will take work
 * just outside those areas.
 *
 * This is the data matching routes on, which makes it the most important thing on a listing after the phone
 * number — and until now it could only be set once, at registration, and only changed by emailing us. A
 * matcher routing on data a business cannot correct is a matcher routing on data that is quietly going
 * stale.
 *
 * One rule worth stating plainly: **a business must keep at least one area and one trade.** Emptying either
 * would make it invisible to matching, which is a decision ("stop sending me work") and not something that
 * should happen as a side effect of unticking boxes. There is no hidden pause switch, so the form says so.
 */

/** The boroughs the lead system covers. East London, per decision D6 — the one place this list lives. */
export const COVERED_BOROUGHS = [
  "Tower Hamlets", "Hackney", "Newham", "Waltham Forest", "Redbridge", "Barking and Dagenham", "Havering",
] as const;

const LOCALITY_KINDS = ["TOWN", "SUBURB", "LOCALITY"] as const;

export type Option = { id: string; name: string };
export type Borough = { id: string; name: string; localities: Option[] };

/** The boroughs and their localities, as the registration and coverage forms both offer them. */
export async function coverageOptions(): Promise<Borough[]> {
  const rows = await db.place.findMany({
    where: { kind: { in: ["LAD", "UNITARY"] }, name: { in: [...COVERED_BOROUGHS] } },
    orderBy: { name: "asc" },
    select: {
      id: true, name: true,
      children: {
        where: { kind: { in: [...LOCALITY_KINDS] }, active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      },
    },
  });
  return rows.map((b) => ({ id: b.id, name: b.name, localities: b.children }));
}

export async function currentCoverage(businessId: string) {
  const [areas, categories, business] = await Promise.all([
    db.businessServiceArea.findMany({
      where: { businessId },
      include: { place: { select: { id: true, label: true, kind: true, parentId: true } } },
    }),
    db.businessCategory.findMany({ where: { businessId }, select: { categoryId: true, isPrimary: true } }),
    db.business.findUnique({ where: { id: businessId }, select: { acceptsNearby: true, categoryId: true } }),
  ]);
  return {
    areaIds: areas.map((a) => a.placeId),
    areas,
    categoryIds: categories.map((c) => c.categoryId),
    primaryCategoryId: categories.find((c) => c.isPrimary)?.categoryId ?? business?.categoryId ?? null,
    acceptsNearby: business?.acceptsNearby ?? false,
  };
}

export type CoverageInput = { areaIds: string[]; categoryIds: string[]; acceptsNearby: boolean };
export type CoverageProblem = { field: "areaIds" | "categoryIds" | "form"; message: string };

/**
 * Checks a proposed coverage change.
 *
 * Ids are checked against the offered set rather than merely for existence: a form that offers seven
 * boroughs should not be able to grant coverage of Cornwall by having its values edited, and a business
 * cannot claim a trade the platform does not list.
 */
export async function validateCoverage(input: CoverageInput): Promise<CoverageProblem[]> {
  const problems: CoverageProblem[] = [];
  const areaIds = [...new Set(input.areaIds)];
  const categoryIds = [...new Set(input.categoryIds)];

  if (areaIds.length === 0) {
    problems.push({ field: "areaIds", message: "Keep at least one area. With none, no job can ever reach you." });
  }
  if (categoryIds.length === 0) {
    problems.push({ field: "categoryIds", message: "Keep at least one kind of work. With none, no job can ever reach you." });
  }

  if (areaIds.length) {
    const boroughs = await coverageOptions();
    const allowed = new Set(boroughs.flatMap((b) => [b.id, ...b.localities.map((l) => l.id)]));
    if (areaIds.some((id) => !allowed.has(id))) {
      problems.push({ field: "areaIds", message: "One of those areas is not one we cover. Please choose from the list." });
    }
  }
  if (categoryIds.length) {
    const real = await db.category.count({ where: { id: { in: categoryIds }, parentId: null } });
    if (real !== categoryIds.length) {
      problems.push({ field: "categoryIds", message: "One of those is not a kind of work we list. Please choose from the list." });
    }
  }
  return problems;
}

/**
 * Saves a coverage change, and says what changed.
 *
 * The mode follows the kind of place: choosing a borough means the whole borough, choosing a locality means
 * that locality only. That is what the two kinds of tick box already mean to the person using them, so
 * deriving it is more honest than a separate switch that can disagree with them.
 *
 * Replaced wholesale inside a transaction: a half-applied coverage change would route jobs by a set of
 * areas nobody chose.
 */
export async function saveCoverage(businessId: string, input: CoverageInput, actor?: Actor) {
  const problems = await validateCoverage(input);
  if (problems.length) return { ok: false as const, problems };

  const before = await currentCoverage(businessId);
  const areaIds = [...new Set(input.areaIds)];
  const categoryIds = [...new Set(input.categoryIds)];

  const places = await db.place.findMany({ where: { id: { in: areaIds } }, select: { id: true, kind: true, label: true } });
  const primary = categoryIds.includes(before.primaryCategoryId ?? "") ? before.primaryCategoryId! : categoryIds[0];

  await db.$transaction([
    db.businessServiceArea.deleteMany({ where: { businessId } }),
    db.businessServiceArea.createMany({
      data: places.map((p) => ({
        businessId, placeId: p.id,
        mode: p.kind === "LAD" || p.kind === "UNITARY" ? "INCLUDES_CHILDREN" : "EXACT",
      })),
    }),
    db.businessCategory.deleteMany({ where: { businessId } }),
    db.businessCategory.createMany({
      data: categoryIds.map((categoryId) => ({ businessId, categoryId, isPrimary: categoryId === primary })),
    }),
    db.business.update({ where: { id: businessId }, data: { acceptsNearby: input.acceptsNearby } }),
  ]);

  const added = areaIds.filter((id) => !before.areaIds.includes(id)).length;
  const removed = before.areaIds.filter((id) => !areaIds.includes(id)).length;
  const catsChanged = categoryIds.length !== before.categoryIds.length ||
    categoryIds.some((c) => !before.categoryIds.includes(c));
  const nearbyChanged = before.acceptsNearby !== input.acceptsNearby;

  // Counts and flags only. What a business covers is not personal data, but the log is still a record of
  // *what* changed rather than a copy of the record itself.
  const detail = [
    `${areaIds.length} area(s)`,
    added ? `+${added}` : null,
    removed ? `-${removed}` : null,
    `${categoryIds.length} trade(s)${catsChanged ? ", changed" : ""}`,
    nearbyChanged ? `nearby work ${input.acceptsNearby ? "on" : "off"}` : null,
  ].filter(Boolean).join(" · ");
  await audit({ action: "Service areas and trades changed", targetType: "Business", targetId: businessId, detail }, actor);

  return { ok: true as const, areas: areaIds.length, categories: categoryIds.length, added, removed, nearbyChanged };
}

/**
 * How much work this coverage would actually have seen.
 *
 * Shown to the owner because "you cover 3 areas" means nothing on its own, while "11 requests came from
 * the areas you cover in the last 30 days" tells them whether widening is worth it. Counted from real
 * requests; nothing modelled, nothing projected.
 */
export async function demandInCoverage(businessId: string, days = 30) {
  const { areaIds, categoryIds } = await currentCoverage(businessId);
  if (!areaIds.length || !categoryIds.length) return { requests: 0, assignedToYou: 0, days };

  // A borough-wide area also covers its localities, which is the same walk the matcher does.
  const children = await db.place.findMany({ where: { parentId: { in: areaIds } }, select: { id: true } });
  const reach = [...new Set([...areaIds, ...children.map((c) => c.id)])];
  const since = new Date(Date.now() - days * 86400_000);

  const [requests, assignedToYou] = await Promise.all([
    db.jobRequest.count({ where: { createdAt: { gte: since }, categoryId: { in: categoryIds }, placeId: { in: reach } } }),
    db.leadAssignment.count({ where: { businessId, createdAt: { gte: since }, status: { not: "REVERSED" } } }),
  ]);
  return { requests, assignedToYou, days };
}
