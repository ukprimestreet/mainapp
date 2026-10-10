// The consent gate: who may be sent what, and the frequency cap.
import { PrismaClient } from "@prisma/client";
import { MARKETING_GAP_MS, mayEmailOwner, recordMarketingSend, resubscribeByToken, unsubscribeByToken, unsubscribeToken } from "../src/lib/email/consent";

const db = new PrismaClient();
let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };

async function main() {
  await db.owner.deleteMany({ where: { email: { endsWith: "@consent.test" } } });
  const o = await db.owner.create({ data: { email: "a@consent.test", name: "Test Owner" } });

  // ---------------- defaults ----------------
  t("service mail always sends", (await mayEmailOwner(o.id, "service")).send === true);
  t("lifecycle mail sends by default", (await mayEmailOwner(o.id, "lifecycle")).send === true);
  t("marketing does NOT send without an explicit opt-in", (await mayEmailOwner(o.id, "marketing")).send === false);
  t("…and the refusal says why", await (async () => {
    const r = await mayEmailOwner(o.id, "marketing");
    return r.send === false && /opt-in/i.test(r.reason);
  })());

  // ---------------- opt-in and the cap ----------------
  await db.owner.update({ where: { id: o.id }, data: { marketingOptIn: true } });
  t("with consent, marketing sends", (await mayEmailOwner(o.id, "marketing")).send === true);
  await recordMarketingSend(o.id);
  t("frequency cap blocks a second promotional email straight away", await (async () => {
    const r = await mayEmailOwner(o.id, "marketing");
    return r.send === false && /frequency cap/i.test(r.reason);
  })());
  t("the cap does not block service or lifecycle mail",
    (await mayEmailOwner(o.id, "service")).send === true && (await mayEmailOwner(o.id, "lifecycle")).send === true);
  await db.owner.update({ where: { id: o.id }, data: { lastMarketingAt: new Date(Date.now() - MARKETING_GAP_MS - 1000) } });
  t("once the fortnight is up, marketing may send again", (await mayEmailOwner(o.id, "marketing")).send === true);

  // ---------------- unsubscribe ----------------
  const token = (await unsubscribeToken(o.id))!;
  t("an unsubscribe token is created and is stable", !!token && (await unsubscribeToken(o.id)) === token);
  t("lifecycle mail carries the unsubscribe link", await (async () => {
    const r = await mayEmailOwner(o.id, "lifecycle");
    return r.send === true && !!r.unsubscribeUrl && r.unsubscribeUrl.includes(token);
  })());
  t("service mail carries no unsubscribe link", await (async () => {
    const r = await mayEmailOwner(o.id, "service");
    return r.send === true && !("unsubscribeUrl" in r && r.unsubscribeUrl);
  })());

  await unsubscribeByToken(token);
  t("unsubscribing stops lifecycle AND marketing",
    (await mayEmailOwner(o.id, "lifecycle")).send === false && (await mayEmailOwner(o.id, "marketing")).send === false);
  t("…but never stops service mail, which would break the account", (await mayEmailOwner(o.id, "service")).send === true);
  t("unsubscribing also clears the marketing opt-in", (await db.owner.findUnique({ where: { id: o.id } }))!.marketingOptIn === false);

  await resubscribeByToken(token);
  t("resubscribing restores lifecycle mail", (await mayEmailOwner(o.id, "lifecycle")).send === true);
  t("…but does not silently restore marketing consent", (await mayEmailOwner(o.id, "marketing")).send === false);

  t("an unknown token does nothing", (await unsubscribeByToken("not-a-real-token")) === null);
  t("an unknown owner is refused", (await mayEmailOwner("no-such-owner", "service")).send === false);

  await db.owner.deleteMany({ where: { email: { endsWith: "@consent.test" } } });
  t("cleanup", (await db.owner.count({ where: { email: { endsWith: "@consent.test" } } })) === 0);
}

main().then(async () => { await db.$disconnect(); console.log(fail ? `${fail} FAILED` : "ALL PASSED"); process.exit(fail ? 1 : 0); })
  .catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
