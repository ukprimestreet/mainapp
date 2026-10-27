import { createHash, randomBytes } from "crypto";
import { db } from "./db";
import { audit } from "./audit";

/**
 * Customer job requests — the demand side.
 *
 * The honest constraint this file is built around: **a lead nobody can service is worse than no lead.** The
 * customer blames us, not the empty directory. So supply is checked before contact details are taken, the
 * count is recorded against the request, and the form says what it actually knows.
 *
 * Matching and assignment are Phase D. This creates the request, resolves it to a real category and place,
 * and counts who could take it.
 */

/**
 * The privacy notice the customer agreed to. **Bump this whenever the wording changes**, so that a change
 * can never retroactively re-characterise what somebody consented to.
 */
export const PRIVACY_NOTICE_VERSION = "2026-10-27";

/** How many businesses a lead may be shared with. A hard product promise, stated on the form. */
export const MAX_RECIPIENTS = 2;

export const URGENCY = {
  EMERGENCY: "It is an emergency",
  WITHIN_A_WEEK: "Within a week",
  FLEXIBLE: "I am flexible",
  PLANNING: "Just planning for now",
} as const;
export type Urgency = keyof typeof URGENCY;
export const isUrgency = (v: string): v is Urgency => v in URGENCY;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// ---------------------------------------------------------------- resolving what the customer said

export type CategoryMatch =
  | { kind: "one"; categoryId: string; name: string }
  /** Genuinely ambiguous — "house clearance" is both removals and rubbish removal. We ask; we never guess. */
  | { kind: "several"; options: { categoryId: string; name: string }[] }
  | { kind: "none" };

/**
 * Turns the words a customer used into a category.
 *
 * Exact alias match only. Fuzzy matching here would mean routing somebody's plumbing emergency to a
 * gardener because the strings looked similar, which is worse than asking.
 */
export async function resolveCategory(input: string): Promise<CategoryMatch> {
  const needle = norm(input);
  if (!needle) return { kind: "none" };

  const hits = await db.categoryAlias.findMany({
    where: { normalised: needle },
    include: { category: { select: { id: true, name: true } } },
  });
  const unique = new Map(hits.map((h) => [h.category.id, h.category.name]));
  if (unique.size === 1) {
    const [categoryId, name] = [...unique.entries()][0];
    return { kind: "one", categoryId, name };
  }
  if (unique.size > 1) {
    return { kind: "several", options: [...unique.entries()].map(([categoryId, name]) => ({ categoryId, name })) };
  }
  return { kind: "none" };
}

// ---------------------------------------------------------------- supply

/**
 * How many businesses could take this job.
 *
 * Coverage is either the exact place, or an ancestor the business marked `INCLUDES_CHILDREN`. Walking up
 * the tree is what makes "I serve the whole borough" mean what the business thought it meant.
 */
export async function providersFor(categoryId: string, placeId: string): Promise<number> {
  const ancestors: string[] = [];
  let id: string | null = placeId;
  for (let depth = 0; id && depth < 8; depth++) {
    const p: { parentId: string | null } | null = await db.place.findUnique({ where: { id }, select: { parentId: true } });
    if (!p?.parentId) break;
    ancestors.push(p.parentId);
    id = p.parentId;
  }

  return db.business.count({
    where: {
      published: true,
      isSample: false,
      categories: { some: { categoryId } },
      serviceAreas: {
        some: {
          OR: [
            { placeId },                                              // picked this exact place
            { placeId: { in: ancestors }, mode: "INCLUDES_CHILDREN" }, // or a parent, and said "all of it"
          ],
        },
      },
    },
  });
}

/** Can we honestly take a job here, or should we say so before asking for a phone number? */
export async function supplyCheck(categoryId: string, placeId: string) {
  const providers = await providersFor(categoryId, placeId);
  return {
    providers,
    /** Enough for the two-recipient promise to be meaningful. */
    good: providers >= MAX_RECIPIENTS,
    /** One provider is still a real introduction, just not a choice. */
    thin: providers > 0 && providers < MAX_RECIPIENTS,
    none: providers === 0,
  };
}

// ---------------------------------------------------------------- creating a request

/** Short, unambiguous when read aloud: no O/0 or I/1 confusion. */
function makeReference(): string {
  const alphabet = "ACDEFGHJKMNPQRTUVWXY2346789";
  const body = Array.from(randomBytes(5), (b) => alphabet[b % alphabet.length]).join("");
  return `PS-${body}`;
}

export type JobInput = {
  name: string; email: string; phone: string;
  categoryId: string; placeId: string; postcode?: string;
  description: string; urgency: Urgency; contactTime?: string;
  marketingOptIn: boolean;
};

export type Problem = { field: keyof JobInput | "form"; message: string };

export async function validateJob(input: JobInput): Promise<Problem[]> {
  const p: Problem[] = [];
  const add = (field: Problem["field"], message: string) => p.push({ field, message });

  if (input.name.trim().length < 2) add("name", "Enter your name, so the business knows who they are calling.");
  if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(input.email.trim())) add("email", "Enter a valid email address.");
  // Phone is required: trades ring people. Asking for it and then not using it would be the odd choice.
  if (!/^([+\d][\d\s()-]{8,19})$/.test(input.phone.trim())) add("phone", "Enter a phone number — this is how a trade will get hold of you.");
  if (input.description.trim().length < 20) add("description", "Tell them a bit more about the job — at least 20 characters. The more they know, the better the quote.");
  if (input.description.trim().length > 2000) add("description", "That is over 2,000 characters. A summary is fine.");
  if (/<[a-z/]/i.test(input.description)) add("description", "Please write plain text, without HTML.");
  if (!isUrgency(input.urgency)) add("urgency", "Choose how soon you need it.");

  if (!(await db.category.findUnique({ where: { id: input.categoryId }, select: { id: true } }))) add("categoryId", "Choose the kind of work you need.");
  if (!(await db.place.findUnique({ where: { id: input.placeId }, select: { id: true } }))) add("placeId", "Tell us where the job is.");

  return p;
}

/**
 * Creates a job request, once.
 *
 * The idempotency key is derived from the content, not from a nonce the browser sends: a double-click, a
 * refresh and a retry after a dropped connection all produce the same key, and the unique index turns the
 * second one into a no-op rather than a second job and a second set of phone calls to the customer.
 */
export async function createJobRequest(input: JobInput, ipHash: string) {
  const key = createHash("sha256")
    .update([input.email.trim().toLowerCase(), input.categoryId, input.placeId, norm(input.description).slice(0, 200)].join("|"))
    .digest("hex");

  const existing = await db.jobRequest.findUnique({ where: { idempotencyKey: key } });
  if (existing) return { request: existing, created: false as const };

  const supply = await supplyCheck(input.categoryId, input.placeId);

  try {
    const request = await db.jobRequest.create({
      data: {
        reference: makeReference(),
        name: input.name.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone.trim(),
        categoryId: input.categoryId,
        placeId: input.placeId,
        postcode: input.postcode?.trim().toUpperCase() || null,
        description: input.description.trim(),
        urgency: input.urgency,
        contactTime: input.contactTime?.trim() || null,
        consentVersion: PRIVACY_NOTICE_VERSION,
        marketingOptIn: input.marketingOptIn,
        ipHash,
        idempotencyKey: key,
        providersAtCreation: supply.providers,
        // Nobody to send it to is not "assigned to nobody": it is unassigned, and an administrator should
        // see it immediately rather than at the end of a timer.
        status: supply.none ? "UNASSIGNED" : "NEW",
      },
    });

    await audit({
      action: "Job request received",
      targetType: "JobRequest", targetId: request.id,
      detail: `${request.reference}: ${supply.providers} provider(s) could take it`,
    }, { kind: "SYSTEM" });

    return { request, created: true as const, supply };
  } catch {
    // Lost a race on the idempotency key: somebody double-clicked and both requests reached the database.
    const won = await db.jobRequest.findUnique({ where: { idempotencyKey: key } });
    if (won) return { request: won, created: false as const };
    throw new Error("Could not record that job request");
  }
}

// ---------------------------------------------------------------- reading

export const jobByReference = (reference: string) =>
  db.jobRequest.findUnique({
    where: { reference: reference.trim().toUpperCase() },
    include: { category: true, place: { include: { parent: true } } },
  });

/** Counts for the admin dashboard. Nothing modelled, nothing estimated. */
export async function leadCounts() {
  const since = (d: number) => new Date(Date.now() - d * 86400_000);
  const [total, unassigned, today, week, noSupply] = await Promise.all([
    db.jobRequest.count(),
    db.jobRequest.count({ where: { status: { in: ["UNASSIGNED", "ESCALATED"] } } }),
    db.jobRequest.count({ where: { createdAt: { gte: since(1) } } }),
    db.jobRequest.count({ where: { createdAt: { gte: since(7) } } }),
    db.jobRequest.count({ where: { providersAtCreation: 0 } }),
  ]);
  return { total, unassigned, today, week, noSupply };
}

/**
 * Where we are taking enquiries we cannot service. The most useful number in the whole system for deciding
 * where to recruit next, because every row is a customer we have already disappointed or are about to.
 */
export async function demandWithoutSupply(take = 20) {
  const rows = await db.jobRequest.groupBy({
    by: ["categoryId", "placeId"],
    where: { providersAtCreation: 0 },
    _count: true,
    orderBy: { _count: { categoryId: "desc" } },
    take,
  });
  const cats = new Map((await db.category.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const places = new Map((await db.place.findMany({ where: { id: { in: rows.map((r) => r.placeId) } }, select: { id: true, label: true } })).map((p) => [p.id, p.label]));
  return rows.map((r) => ({
    category: cats.get(r.categoryId) ?? r.categoryId,
    place: places.get(r.placeId) ?? r.placeId,
    requests: r._count,
  }));
}
