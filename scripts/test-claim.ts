import { submitClaim } from "../src/app/claim/actions";
import { db } from "../src/lib/db";
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const good = { business: "lea-valley-maids", name: "Test Owner", email: "Test@Example.com", phone: "+44 20 7946 0000", role: "Owner", relationship: "owner", verification: "Email me at the business domain address." };
const eq = (n: string, c: boolean) => { console.log(c ? "PASS" : "FAIL", n); if (!c) process.exitCode = 1; };
(async () => {
  eq("empty rejected", (await submitClaim({ ok: false }, fd({}))).ok === false);
  const bad = await submitClaim({ ok: false }, fd({ ...good, email: "nope", phone: "x" }));
  eq("invalid email/phone give field errors", !!bad.errors?.email && !!bad.errors?.phone && bad.values?.name === "Test Owner");
  eq("honeypot silent success, nothing stored", (await submitClaim({ ok: false }, fd({ ...good, website_url: "http://spam" }))).ok === true && (await db.claimRequest.count()) === 0);
  eq("unknown business rejected", !!(await submitClaim({ ok: false }, fd({ ...good, business: "ghost" }))).errors?.business);
  eq("valid accepted", (await submitClaim({ ok: false }, fd(good))).ok === true);
  const b = await db.business.findUnique({ where: { slug: "lea-valley-maids" } });
  eq("status flips to PENDING", b?.claimStatus === "PENDING");
  const dup = await submitClaim({ ok: false }, fd(good));
  eq("duplicate not stored twice", dup.ok && (await db.claimRequest.count()) === 1);
  await db.claimRequest.deleteMany(); await db.business.update({ where: { slug: "lea-valley-maids" }, data: { claimStatus: "UNCLAIMED" } });
})().finally(() => db.$disconnect());
