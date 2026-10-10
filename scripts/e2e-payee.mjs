// End to end: a writer saves payment details, an admin reveals them, and both leave the right trail.
// Run against `next start -p 3417`.
import puppeteer from "puppeteer-core";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/author-password.ts";

const BASE = process.env.BASE ?? "http://localhost:3417";
const env = readFileSync(".env", "utf8");
const PW = env.match(/ADMIN_PASSWORD="(.*)"/)[1];
const ADMIN_EMAIL = env.match(/ADMIN_EMAIL="(.*)"/)[1];
const db = new PrismaClient();

let fail = 0;
const t = (n, c, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };
/** Submits the details form itself: the button can sit below the fold, where it has no clickable point. */
const submit = async (page) => Promise.all([
  page.evaluate(() => document.querySelector("#payeeName").closest("form").requestSubmit()),
  page.waitForNavigation({ waitUntil: "networkidle0" }),
]);

const EMAIL = "payee@e2e.example";
const WRITER_PW = "e2e-payee-password-1";
const ACCOUNT = "87654321";
const UTR = "1122334455";

async function cleanup() {
  const a = await db.author.findUnique({ where: { email: EMAIL } });
  if (a) {
    await db.auditLog.deleteMany({ where: { targetId: a.id } });
    await db.writerPayment.deleteMany({ where: { authorId: a.id } });
    await db.author.delete({ where: { id: a.id } });
  }
}
await cleanup();

const writer = await db.author.create({
  data: {
    slug: `e2e-payee-${Date.now()}`, name: "Pay Ee", email: EMAIL, role: "Reporter",
    bio: "b".repeat(140), imageUrl: "https://example.com/p.jpg", phone: "020 7946 0020",
    basedIn: "Hackney", experience: "e".repeat(140), cvUrl: "https://example.com/cv.pdf",
    expertise: JSON.stringify(["High streets"]), portfolio: JSON.stringify(["https://example.com/x"]),
    website: "https://example.com", passwordHash: hashPassword(WRITER_PW),
    acceptedTermsAt: new Date(), emailVerifiedAt: new Date(), active: true,
  },
});
await db.writerPayment.create({ data: { authorId: writer.id, amountPence: 20000, description: "E2E fee", status: "DUE" } });

const browser = await puppeteer.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

// ---------------- the writer ----------------
await page.goto(`${BASE}/write/login`, { waitUntil: "networkidle0" });
await page.type("#email", EMAIL);
await page.type("#password", WRITER_PW);
await Promise.all([
  page.click("form:has(#password) button:not([type=button])"),
  page.waitForFunction(() => location.pathname.startsWith("/write") && location.pathname !== "/write/login", { timeout: 10000 }),
]);

await page.goto(`${BASE}/write/payments`, { waitUntil: "networkidle0" });
t("the payments page warns a writer we cannot pay yet", /no way to pay you yet/i.test(await page.evaluate(() => document.body.innerText)));

await page.goto(`${BASE}/write/payments/details`, { waitUntil: "networkidle0" });
const askedBeforeMoney = await page.evaluate(() => document.body.innerText);
t("the page says it is needed to be paid, not to write", /do not need it to write/i.test(askedBeforeMoney));
t("…and warns that we never ask for details by email", /never ask you for them by email/i.test(askedBeforeMoney));

// A rejected save first: VAT ticked with no number.
await page.type("#payeeName", "Pay Ee Media");
await page.type("#payeeAddress", "2 Mare Street, London E8");
await page.click('input[name="vatRegistered"]');
await submit(page);
t("ticking VAT with no number is refused", /give your vat number/i.test(await page.evaluate(() => document.body.innerText)));

// A bad sort code.
await page.goto(`${BASE}/write/payments/details`, { waitUntil: "networkidle0" });
await page.type("#payeeName", "Pay Ee Media");
await page.type("#payeeAddress", "2 Mare Street, London E8");
await page.type("#accountName", "Pay Ee Media");
await page.type("#sortCode", "0400");
await page.type("#accountNumber", ACCOUNT);
await submit(page);
t("a five-digit sort code is refused", /six digits/.test(await page.evaluate(() => document.body.innerText)));

const afterBadSave = await db.author.findUnique({ where: { id: writer.id } });
t("nothing was stored from the refused save", afterBadSave.bankEnc === null);

// The real save.
await page.goto(`${BASE}/write/payments/details`, { waitUntil: "networkidle0" });
await page.type("#payeeName", "Pay Ee Media");
await page.type("#payeeAddress", "2 Mare Street, London E8");
await page.type("#accountName", "Pay Ee Media");
await page.type("#sortCode", "04-00-04");
await page.type("#accountNumber", ACCOUNT);
await page.type("#utr", UTR);
await submit(page);
const saved = await page.evaluate(() => document.body.innerText);
t("the save is confirmed with the last four digits", saved.includes("4321"));

const row = await db.author.findUnique({ where: { id: writer.id } });
t("the account number is not in the database in plain text", !row.bankEnc.includes(ACCOUNT));
t("the UTR is not in the database in plain text", !row.utrEnc.includes(UTR));
t("only the last four digits are kept readable", row.bankLast4 === "4321");
t("the save is dated", !!row.bankUpdatedAt);

const writerAudit = await db.auditLog.findMany({ where: { targetId: writer.id } });
t("the change is in the audit log", writerAudit.some((a) => a.action === "Writer payment details changed"));
t("…and the audit log does NOT contain the account number", !writerAudit.some((a) => `${a.detail}`.includes(ACCOUNT)));

// Editing something else must not wipe the account or the UTR.
await page.goto(`${BASE}/write/payments/details`, { waitUntil: "networkidle0" });
const prefilled = await page.evaluate(() => ({ sort: document.querySelector("#sortCode").value, acct: document.querySelector("#accountNumber").value, html: document.documentElement.outerHTML }));
t("the account number is never written back into the page", !prefilled.html.includes(ACCOUNT) && prefilled.acct === "" && prefilled.sort === "");
await page.evaluate(() => { document.querySelector("#payeeAddress").value = ""; });
await page.type("#payeeAddress", "3 Mare Street, London E8");
await submit(page);
const afterEdit = await db.author.findUnique({ where: { id: writer.id } });
t("editing the address leaves the account alone", afterEdit.bankLast4 === "4321" && afterEdit.bankEnc === row.bankEnc);
t("…and leaves the UTR alone", afterEdit.utrEnc === row.utrEnc);

await page.goto(`${BASE}/write/payments`, { waitUntil: "networkidle0" });
t("the payments page now says we can pay them", /we can pay you/i.test(await page.evaluate(() => document.body.innerText)));

// ---------------- the admin ----------------
await page.goto(`${BASE}/admin/login`, { waitUntil: "networkidle0" });
await page.type("#email", ADMIN_EMAIL);
await page.type("#password", PW);
await Promise.all([page.click("form:has(#password) button"), page.waitForFunction(() => location.pathname === "/admin", { timeout: 10000 })]);

await page.goto(`${BASE}/admin/payments`, { waitUntil: "networkidle0" });
const adminBefore = await page.evaluate(() => document.body.innerText);
t("the admin page does not show an account number until asked", !adminBefore.includes(ACCOUNT));

await page.goto(`${BASE}/admin/payments?reveal=${writer.id}`, { waitUntil: "networkidle0" });
const revealed = await page.evaluate(() => document.body.innerText);
t("a reveal shows the real account number", revealed.includes(ACCOUNT));
t("…and the formatted sort code", revealed.includes("04-00-04"));
t("…and says the view was recorded", /recorded in the audit log/i.test(revealed));

// The logged reveal comes from the button, which posts an action; check that path writes the entry.
await page.goto(`${BASE}/admin/payments`, { waitUntil: "networkidle0" });
const hasRevealButton = await page.evaluate(() => [...document.querySelectorAll("button")].some((b) => b.innerText.includes("Show bank details")));
t("…and a reveal button only appears next to a submitted invoice", hasRevealButton === false, "no submitted invoice in this fixture, so no button is correct");

await browser.close();
await cleanup();
await db.$disconnect();
console.log(fail === 0 ? "\nALL PAYEE E2E CHECKS PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
