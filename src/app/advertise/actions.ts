"use server";
import { z } from "zod";
import { checkFormToken, ipHash, isDisposableEmail } from "@/lib/antispam";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";

export type EnqState = { ok?: boolean; message?: string; errors?: Record<string, string> };
const schema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
  company: z.string().trim().max(120).optional(),
  interest: z.enum(["premium", "featured", "advertising", "sponsorship", "other"], { message: "Choose what you're interested in" }),
  message: z.string().trim().min(10, "Tell us a little about what you need").max(2000),
});

export async function submitEnquiry(_: EnqState, fd: FormData): Promise<EnqState> {
  if (String(fd.get("fax_site") ?? "")) return { ok: true, message: "Thanks — we'll be in touch." };
  const t = checkFormToken(String(fd.get("ft") ?? ""), { minMs: 2500 });
  if (t === "too-fast") return { message: "That was very quick — please try again." };
  if (t !== "ok") return { message: "This form has expired. Please reload the page." };
  const p = schema.safeParse({ name: fd.get("name"), email: fd.get("email"), company: String(fd.get("company") ?? "") || undefined, interest: fd.get("interest"), message: fd.get("message") });
  if (!p.success) { const errors: Record<string, string> = {}; for (const i of p.error.issues) errors[String(i.path[0])] ??= i.message; return { errors }; }
  const d = p.data;
  if (isDisposableEmail(d.email)) return { errors: { email: "Please use a permanent email address." } };
  const ip = await ipHash();
  // per-visitor daily cap using the lead-style hash stored in the message footer is overkill; cap by email instead
  if ((await db.salesEnquiry.count({ where: { email: d.email, createdAt: { gte: new Date(Date.now() - 86400_000) } } })) >= 3) return { message: "We already have your enquiries — we'll reply soon." };
  void ip;
  const businessId = String(fd.get("business") ?? "") || null;
  const row = await db.salesEnquiry.create({ data: { name: d.name, email: d.email, company: d.company ?? null, interest: d.interest, message: d.message, businessId } });
  const admin = (process.env.ADMIN_EMAIL ?? "").trim();
  if (admin) await sendMail(admin, `New ${d.interest} enquiry from ${d.name}`, `${d.name} <${d.email}>${d.company ? `\n${d.company}` : ""}\n\n${d.message}\n\n(Enquiry ${row.id})`);
  return { ok: true, message: "Thanks — we'll be in touch within two working days." };
}
