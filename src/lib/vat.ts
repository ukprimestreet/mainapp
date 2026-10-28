import { db } from "./db";

/**
 * VAT (D4). **Off by default, pending VAT registration** — this project is not VAT-registered yet, so
 * charging it before registration would be unlawful. An admin switches it on from Settings once registered,
 * and sets the rate at the same time. Nothing here assumes 20% or any other figure.
 *
 * Every monetary record that can carry VAT (an `Order`, in Phase 2) snapshots the rate that applied *at the
 * time*, so a later change of rate or a later switch-off never rewrites history — see `vatPence`/`vatRateBp`
 * on `Order` in schema.prisma.
 */
export const VAT_ENABLED_KEY = "vat.enabled";
export const VAT_RATE_KEY = "vat.rate_bp"; // basis points: 2000 = 20%
const DEFAULT_RATE_BP = 2000;

export type VatSettings = { enabled: boolean; rateBp: number };

export async function vatSettings(): Promise<VatSettings> {
  const rows = await db.setting.findMany({ where: { key: { in: [VAT_ENABLED_KEY, VAT_RATE_KEY] } } });
  const enabled = rows.find((r) => r.key === VAT_ENABLED_KEY)?.value === "yes";
  const rateRaw = Number(rows.find((r) => r.key === VAT_RATE_KEY)?.value);
  const rateBp = Number.isFinite(rateRaw) && rateRaw > 0 && rateRaw <= 10000 ? Math.round(rateRaw) : DEFAULT_RATE_BP;
  return { enabled, rateBp };
}

/** Adds VAT on top of a VAT-exclusive price. Returns the components so the exclusive amount is never lost. */
export function applyVat(netPence: number, vat: VatSettings): { grossPence: number; vatPence: number; rateBp: number } {
  if (!vat.enabled || netPence <= 0) return { grossPence: netPence, vatPence: 0, rateBp: 0 };
  const vatPence = Math.round((netPence * vat.rateBp) / 10000);
  return { grossPence: netPence + vatPence, vatPence, rateBp: vat.rateBp };
}

/** Recognised revenue (ex VAT) from a gross amount and the VAT portion already recorded against it. */
export const exVat = (grossPence: number, vatPence: number) => grossPence - vatPence;

export const formatRate = (rateBp: number) => `${(rateBp / 100).toFixed(rateBp % 100 ? 2 : 0)}%`;
