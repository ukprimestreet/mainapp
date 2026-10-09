"use server";
import { z } from "zod";
import { checkFormToken, ipHash, isDisposableEmail } from "@/lib/antispam";
import { isPremium } from "@/lib/commerce";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";

export type LeadState = { ok?: boolean; message?: string; errors?: Record<string, string> };

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
  phone: z.string().trim().regex(/^([+\d][\d\s()-]{6,19})?$/, "Enter a valid phone number").optional(),
  message: z.string().trim().min(20, "Tell them a bit more — at least 20 characters").max(1500, "Message is over 1500 characters"),
});

/** Premium feature. Server-side gate + anti-abuse: honeypot, timing, disposable emails, per-IP / per-email / per-business limits. */
export async function submitLead(_: LeadState, fd: FormData): Promise<LeadState> {
  if (String(fd.get("company_site") ?? "")) return { ok: true, message: "Thanks — your enquiry has been sent." }; // honeypot
  const tok = checkFormToken(String(fd.get("ft") ?? ""), { minMs: 3000 });
  if (tok === "too-fast") return { message: "That was very quick — please check your message and send it again." };
  if (tok !== "ok") return { message: "This form has expired. Please reload the page." };
  const p = schema.safeParse({ name: fd.get("name"), email: fd.get("email"), phone: String(fd.get("phone") ?? "") || undefined, message: fd.get("message") });
  if (!p.success) { const errors: Record<string, string> = {}; for (const i of p.error.issues) errors[String(i.path[0])] ??= i.message; return { errors }; }
  const d = p.data;
  if (isDisposableEmail(d.email)) return { errors: { email: "Please use a permanent email address." } };
  const business = await db.business.findFirst({ where: { id: String(fd.get("business")), published: true }, include: { owners: { include: { owner: true } } } });
  if (!business || business.isSample) return { message: "This business can't receive enquiries." };
  if (!(await isPremium(business.id))) return { message: "This business isn't accepting enquiries through PrimeStreet." };

  const ip = await ipHash(), since = new Date(Date.now() - 86400_000);
  const [byIp, byEmail, byBiz] = await Promise.all([
    db.lead.count({ where: { ipHash: ip, createdAt: { gte: since } } }),
    db.lead.count({ where: { businessId: business.id, email: d.email, createdAt: { gte: since } } }),
    db.lead.count({ where: { businessId: business.id, createdAt: { gte: new Date(Date.now() - 3600_000) } } }),
  ]);
  if (byIp >= 10 || byEmail >= 3 || byBiz >= 20) return { message: "You've sent several enquiries recently. Please try again later." };

  const lead = await db.lead.create({ data: { businessId: business.id, name: d.name, email: d.email, phone: d.phone ?? null, message: d.message, ipHash: ip } });
  for (const o of business.owners) {
    // Reply-To is the customer, so the owner can simply hit reply and reach them. No do-not-reply footer here.
    // Reply-To is the customer, so the owner can just hit reply and reach them. No do-not-reply footer here.
    await sendMail(
      o.owner.email,
      `New enquiry for ${business.name} via PrimeStreet`,
      [
        `${d.name} sent you an enquiry through your PrimeStreet profile.`,
        "",
        `From: ${d.name} <${d.email}>`,
        ...(d.phone ? [`Phone: ${d.phone}`] : []),
        "",
        d.message,
        "",
        `Just reply to this email and it goes straight to ${d.name} at ${d.email}.`,
        "Every enquiry is also saved in your PrimeStreet dashboard.",
        `(Enquiry ${lead.id})`,
      ].join("\n"),
      { purpose: "enquiries", replyTo: d.email, noFooter: true },
    );
  }
  return { ok: true, message: "Thanks — your enquiry has been sent. The business will reply directly to your email." };
}
