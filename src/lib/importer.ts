import { z } from "zod";
import { db } from "./db";
import { findDuplicate, normName, normPhone, safeUrl, slugify, uniqueSlug, websiteHost } from "./business";

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF, newlines inside quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
}

export const CSV_COLUMNS = ["name", "category", "area", "summary", "description", "address", "postcode", "phone", "website", "email", "instagram", "facebook", "linkedin", "services", "areas_served", "founded", "source"] as const;

const optUrl = z.string().optional().transform((v) => (v ? v : undefined)).refine((v) => !v || safeUrl(v), "not a valid http(s) URL");
const rowSchema = z.object({
  name: z.string().min(2, "name required").max(120),
  category: z.string().min(1, "category required"),
  area: z.string().min(1, "area required"),
  summary: z.string().min(10, "summary too short").max(160, "summary over 160 chars"),
  description: z.string().min(60, "description must be original text of at least 60 chars").max(3000),
  address: z.string().optional(),
  postcode: z.string().optional(),
  phone: z.string().optional(),
  website: optUrl,
  email: z.string().email("invalid email").optional().or(z.literal("")),
  instagram: optUrl, facebook: optUrl, linkedin: optUrl,
  services: z.string().optional(),
  areas_served: z.string().optional(),
  founded: z.string().regex(/^(1[89]|20)\d{2}$/, "founded must be a year").optional().or(z.literal("")),
  source: z.string().min(3, "source (provenance) required"),
});

export type RowResult = { line: number; name: string; status: "create" | "duplicate" | "error"; detail?: string; slug?: string };
export type ImportReport = { dryRun: boolean; results: RowResult[]; created: number; duplicates: number; errors: number };

export async function runImport(text: string, opts: { dryRun: boolean }): Promise<ImportReport> {
  const rows = parseCsv(text);
  const [cats, locs, city] = await Promise.all([db.category.findMany(), db.location.findMany(), db.city.findUnique({ where: { slug: "london" } })]);
  const find = <T extends { name: string; slug: string }>(list: T[], v: string) => list.find((x) => x.slug === slugify(v) || x.name.toLowerCase() === v.toLowerCase());
  const seen = new Set<string>();
  const results: RowResult[] = [];

  for (const [i, raw] of rows.entries()) {
    const line = i + 2;
    const name = raw.name || "(no name)";
    const p = rowSchema.safeParse(raw);
    if (!p.success) { results.push({ line, name, status: "error", detail: p.error.issues.map((x) => `${String(x.path[0])}: ${x.message}`).join("; ") }); continue; }
    const d = p.data;
    const cat = find(cats, d.category), loc = find(locs, d.area);
    if (!cat) { results.push({ line, name, status: "error", detail: `unknown category "${d.category}"` }); continue; }
    if (!loc || !city) { results.push({ line, name, status: "error", detail: `unknown area "${d.area}"` }); continue; }

    const key = `${normName(d.name)}|${loc.id}`;
    const hostKey = websiteHost(d.website);
    const phoneKey = normPhone(d.phone);
    if (seen.has(key) || (hostKey && seen.has(`h:${hostKey}`)) || (phoneKey.length >= 9 && seen.has(`p:${phoneKey}`))) {
      results.push({ line, name, status: "duplicate", detail: "duplicate of an earlier row in this file" }); continue;
    }
    const dupe = await findDuplicate({ name: d.name, locationId: loc.id, phone: d.phone, website: d.website });
    if (dupe) { results.push({ line, name, status: "duplicate", detail: `matches existing "${dupe.business.name}" (${dupe.reason})` }); continue; }
    seen.add(key); if (hostKey) seen.add(`h:${hostKey}`); if (phoneKey.length >= 9) seen.add(`p:${phoneKey}`);

    if (opts.dryRun) { results.push({ line, name, status: "create" }); continue; }
    const slug = await uniqueSlug(d.name);
    await db.business.create({
      data: {
        slug, name: d.name, summary: d.summary, description: d.description, cityId: city.id, locationId: loc.id, categoryId: cat.id,
        address: d.address || null, postcode: d.postcode || null, phone: d.phone || null,
        website: safeUrl(d.website), websiteHost: hostKey, email: d.email || null,
        instagram: safeUrl(d.instagram), facebook: safeUrl(d.facebook), linkedin: safeUrl(d.linkedin),
        services: d.services ? JSON.stringify(d.services.split("|").map((s) => s.trim()).filter(Boolean)) : null,
        areasServed: d.areas_served || loc.name, founded: d.founded ? Number(d.founded) : null,
        normName: normName(d.name), source: d.source, claimStatus: "UNCLAIMED", isSample: false, published: true,
      },
    });
    await db.auditLog.create({ data: { action: "IMPORT_CREATE", targetType: "Business", targetId: slug, detail: d.source } });
    results.push({ line, name, status: "create", slug });
  }
  const count = (s: RowResult["status"]) => results.filter((r) => r.status === s).length;
  return { dryRun: opts.dryRun, results, created: count("create"), duplicates: count("duplicate"), errors: count("error") };
}
