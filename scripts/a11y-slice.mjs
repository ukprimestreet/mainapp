// Focused axe-core + real-overflow audit of the pages added in the dashboard slice.
// The full sweep is scripts/a11y.mjs; this one exists to check a change quickly.
import puppeteer from "puppeteer-core";
import { readFileSync } from "fs";
import { createHash, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/author-password.ts";

const BASE = process.env.BASE ?? "http://localhost:3417";
const axeSrc = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const env = readFileSync(".env", "utf8");
const PW = env.match(/ADMIN_PASSWORD="(.*)"/)[1];
const ADMIN_EMAIL = env.match(/ADMIN_EMAIL="(.*)"/)[1];
const db = new PrismaClient();
const sh = (x) => createHash("sha256").update(x).digest("hex");

const [city, loc, cat] = [await db.city.findFirst(), await db.location.findFirst(), await db.category.findFirst()];
const owner =
  (await db.owner.findFirst({ where: { email: "owner@slice.example" } })) ??
  (await db.owner.create({ data: { email: "owner@slice.example", name: "Slice Owner" } }));
const fx =
  (await db.business.findFirst({ where: { slug: "slice-fixture" } })) ??
  (await db.business.create({ data: { slug: "slice-fixture", name: "Slice Fixture", summary: "A fixture for audits.", description: "x".repeat(90), cityId: city.id, locationId: loc.id, categoryId: cat.id, phone: "020 7946 0000" } }));
await db.businessOwner.upsert({ where: { ownerId_businessId: { ownerId: owner.id, businessId: fx.id } }, create: { ownerId: owner.id, businessId: fx.id }, update: {} });
const inviteTok = randomBytes(12).toString("base64url");
await db.teamInvite.deleteMany({ where: { email: "mate@slice.example" } });
await db.teamInvite.create({ data: { businessId: fx.id, email: "mate@slice.example", invitedBy: "owner@slice.example", tokenHash: sh(inviteTok), expiresAt: new Date(Date.now() + 7 * 86400_000) } });

// A writer with a complete profile and a known password, so the writer pages are audited rather than
// bouncing to the sign-in page (which is what makes a "clean" writer run meaningless).
const WRITER_PW = "slice-audit-password-9";
const writer = await db.author.upsert({
  where: { email: "writer@slice.example" },
  create: {
    slug: "slice-audit-writer", name: "Sadie Slice", email: "writer@slice.example",
    role: "Reporter", bio: "b".repeat(140), imageUrl: "https://example.com/p.jpg",
    phone: "020 7946 0010", basedIn: "Hackney", experience: "e".repeat(140),
    cvUrl: "https://example.com/cv.pdf", expertise: JSON.stringify(["High streets"]),
    portfolio: JSON.stringify(["https://example.com/piece"]), website: "https://example.com",
    passwordHash: hashPassword(WRITER_PW), acceptedTermsAt: new Date(), emailVerifiedAt: new Date(), active: true,
  },
  update: { passwordHash: hashPassword(WRITER_PW), acceptedTermsAt: new Date(), active: true },
});

const paths = [
  "/admin/commissions", "/admin/payments", "/admin/automations", "/admin/money",
  "/admin/corrections", "/admin/audit", "/admin/moderation", "/admin/settings",
  "/write/commissions", "/write/payments", "/write/performance", "/write/notifications", "/write/style",
  `/owner/business/${fx.id}/insights`, `/owner/business/${fx.id}/photos`, `/owner/business/${fx.id}/offers`,
  `/owner/business/${fx.id}/billing`, `/owner/business/${fx.id}/team`, `/owner/business/${fx.id}/hours`, "/owner/help",
  `/owner/team/${inviteTok}`, "/owner/team/not-a-real-token",
];

const browser = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
let bad = 0;

for (const w of [390, 1440]) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: 900, isMobile: w < 768, deviceScaleFactor: 1 });

  await page.goto(BASE + "/admin/login");
  await page.type("#email", ADMIN_EMAIL);
  await page.type("#password", PW);
  await Promise.all([page.click("form:has(#password) button"), page.waitForFunction(() => location.pathname === "/admin")]);

  const raw = randomBytes(12).toString("base64url");
  await db.ownerLoginToken.create({ data: { ownerId: owner.id, tokenHash: sh(raw), expiresAt: new Date(Date.now() + 3600_000) } });
  await page.goto(`${BASE}/owner/login/${raw}`, { waitUntil: "networkidle0" });
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText === "Sign in").click());
  await page.waitForFunction(() => location.pathname === "/owner", { timeout: 8000 });

  // Cookies are shared across pages in one browser, so on the second viewport we are already signed in.
  await page.goto(BASE + "/write/login", { waitUntil: "networkidle0" });
  if (await page.$("#password")) {
  await page.type("#email", writer.email);
  await page.type("#password", WRITER_PW);
  await Promise.all([page.click("form:has(#password) button[type=submit], form:has(#password) button:not([type=button])"), page.waitForFunction(() => location.pathname.startsWith("/write") && location.pathname !== "/write/login", { timeout: 10000 })]);
  }

  for (const path of paths) {
    const res = await page.goto(BASE + path, { waitUntil: "networkidle0" });
    if (res.status() !== 200) { bad++; console.log(`STATUS ${w}px ${path} -> ${res.status()}`); continue; }
    // A bounce to a sign-in page is also a 200, so auditing the wrong page would otherwise look clean.
    const landed = new URL(page.url()).pathname;
    if (landed !== path.split("?")[0]) { bad++; console.log(`REDIRECTED ${w}px ${path} -> ${landed}`); continue; }

    // Does the page actually scroll sideways? (documentElement.scrollWidth counts scrollable children.)
    const overflow = await page.evaluate(() => {
      const cw = document.documentElement.clientWidth;
      window.scrollTo(9999, 0);
      const x = window.scrollX;
      window.scrollTo(0, 0);
      return Math.max(x, document.body.scrollWidth - cw);
    });
    if (overflow > 1) { bad++; console.log(`OVERFLOW ${w}px ${path} (+${overflow}px)`); }

    await page.evaluate(axeSrc);
    const violations = await page.evaluate(async () =>
      (await axe.run({ runOnly: ["wcag2a", "wcag2aa", "wcag21aa", "best-practice"] })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, ex: v.nodes[0].target.join(" "), help: v.help })),
    );
    for (const v of violations) { bad++; console.log(`AXE ${w}px ${path}: [${v.impact}] ${v.id} x${v.n} — ${v.help} — e.g. ${v.ex}`); }
  }
  await page.close();
  console.log(`${w}px done`);
}

await browser.close();
await db.$disconnect();
console.log(bad === 0 ? `CLEAN: ${paths.length} pages x 2 widths, no status errors, no overflow, no axe violations` : `${bad} issues`);
process.exit(bad === 0 ? 0 : 1);
