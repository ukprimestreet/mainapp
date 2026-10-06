"use server";
import { z } from "zod";
import { safeUrl } from "@/lib/business";
import { db } from "@/lib/db";

export type SubmitState = { ok: boolean; errors?: Record<string, string>; message?: string; values?: Record<string, string> };

const schema = z.object({
  name: z.string().trim().min(2, "Enter the business name").max(120),
  category: z.string().min(1, "Choose a category"),
  area: z.string().min(1, "Choose an area"),
  description: z.string().trim().min(40, "Describe the business in your own words (at least 40 characters)").max(1500),
  address: z.string().trim().max(200).optional(),
  postcode: z.string().trim().max(10).optional(),
  phone: z.string().trim().max(30).optional(),
  website: z.string().trim().max(200).optional().refine((v) => !v || safeUrl(v), "Enter a valid website address"),
  submitterName: z.string().trim().min(2, "Enter your name").max(100),
  submitterEmail: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
  isOwner: z.string().optional(),
});

export async function submitBusiness(_: SubmitState, fd: FormData): Promise<SubmitState> {
  if (String(fd.get("company_url") ?? "")) return { ok: true }; // honeypot
  const p = schema.safeParse(Object.fromEntries(fd));
  if (!p.success) {
    const errors: Record<string, string> = {};
    for (const i of p.error.issues) errors[String(i.path[0])] ??= i.message;
    return { ok: false, errors, values: Object.fromEntries([...fd].filter(([k]) => k !== "company_url").map(([k, v]) => [k, String(v)])) };
  }
  const d = p.data;
  const [cat, loc] = await Promise.all([db.category.findUnique({ where: { slug: d.category } }), db.location.findFirst({ where: { slug: d.area } })]);
  if (!cat || !loc) return { ok: false, errors: { category: "Choose a valid category and area" } };
  const recent = await db.businessSubmission.count({ where: { submitterEmail: d.submitterEmail, createdAt: { gte: new Date(Date.now() - 86400_000) } } });
  if (recent >= 3) return { ok: false, message: "You've sent several suggestions today. Please try again tomorrow." };
  await db.businessSubmission.create({
    data: {
      name: d.name, category: cat.slug, area: loc.slug, description: d.description, address: d.address || null, postcode: d.postcode || null,
      phone: d.phone || null, website: safeUrl(d.website), submitterName: d.submitterName, submitterEmail: d.submitterEmail, isOwner: d.isOwner === "on",
    },
  });
  return { ok: true };
}
