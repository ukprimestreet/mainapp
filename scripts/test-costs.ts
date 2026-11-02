import { db } from "../src/lib/db";
import { recordedExpenses, revenueInRange } from "../src/lib/growth";
import {
  CASH_BALANCE_DATE_KEY, CASH_BALANCE_PENCE_KEY, burnRateAndRunway, cashBaseline, currentCashEstimate, monthlyNetCashFlow, recurringCostRunRate,
} from "../src/lib/costs";

let fail = 0;
const t = (n: string, c: boolean, d = "") => { console.log(c ? "PASS" : "FAIL", n, c ? "" : d); if (!c) fail++; };
const d2 = (v: Date) => v.toISOString().slice(0, 10);

(async () => {
  const now = new Date();

  // ---------------------------------------------------------- baseline not set
  const wipeSettings = () => db.setting.deleteMany({ where: { key: { in: [CASH_BALANCE_PENCE_KEY, CASH_BALANCE_DATE_KEY] } } });
  await wipeSettings();
  t("cashBaseline: returns null when not configured", (await cashBaseline()) === null);
  t("currentCashEstimate: returns null when no baseline is set", (await currentCashEstimate(now)) === null);

  // ---------------------------------------------------------- baseline set
  // Anchored to the start of the current calendar month (not "30 days ago"): the forced burn fixture
  // below is deliberately dated in the *previous* calendar month, and the baseline must exclude it —
  // otherwise currentCashEstimate() folds that forced cost into the balance too and the runway
  // assertion goes negative depending purely on what day of the month the suite happens to run.
  const baselineAsOf = new Date(now.getFullYear(), now.getMonth(), 1);
  await db.setting.upsert({ where: { key: CASH_BALANCE_PENCE_KEY }, create: { key: CASH_BALANCE_PENCE_KEY, value: "100000" }, update: { value: "100000" } });
  await db.setting.upsert({ where: { key: CASH_BALANCE_DATE_KEY }, create: { key: CASH_BALANCE_DATE_KEY, value: d2(baselineAsOf) }, update: { value: d2(baselineAsOf) } });

  const base = await cashBaseline();
  t("cashBaseline: reads back the pence and date just set", base !== null && base.pence === 100000 && d2(base.asOf) === d2(baselineAsOf));

  // Cross-checked against the exact same underlying functions Growth/Finance use, so this is exact
  // regardless of whatever other test scripts have added to the shared dev database.
  const [revenue, expenses] = await Promise.all([revenueInRange(baselineAsOf, now), recordedExpenses(baselineAsOf, now)]);
  const expectedPence = 100000 + revenue.total - expenses.pence;
  const estimate = await currentCashEstimate(now);
  t("currentCashEstimate: baseline + revenue since baseline − expenses since baseline, matching growth.ts's own functions exactly", estimate !== null && estimate.pence === expectedPence && estimate.baselinePence === 100000);

  // ---------------------------------------------------------- monthly net cash flow
  const flows = await monthlyNetCashFlow(6, now);
  t("monthlyNetCashFlow: returns the requested number of months, oldest first, each internally consistent", flows.length === 6 && flows.every((f) => f.netPence === f.revenuePence - f.expensePence));
  t("monthlyNetCashFlow: only the final (current) month is flagged incomplete", flows.slice(0, 5).every((f) => f.complete) && flows[5].complete === false);

  // ---------------------------------------------------------- forced burn, via a large expense in the prior complete month
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 10, 12);
  const bigExpense = await db.expense.create({ data: { category: "CT_TEST", description: "Unit test huge one-off cost", amountPence: 100_000_000, date: prevMonth } });
  const burn = await burnRateAndRunway(3, now);
  t("burnRateAndRunway: a forced large cost in the trailing window makes the average net negative and marks it burning", burn.monthsSampled === 3 && burn.avgMonthlyNetPence < 0 && burn.burning === true);
  t("burnRateAndRunway: with a baseline set and burning, runway is a positive number of months", burn.runwayMonths !== null && burn.runwayMonths > 0);
  await db.expense.delete({ where: { id: bigExpense.id } });

  // ---------------------------------------------------------- recurring run-rate (delta, same reason as above)
  const before = await recurringCostRunRate(now);
  const recurringExpense = await db.expense.create({ data: { category: "CT_TEST", description: "Unit test recurring hosting", amountPence: 4200, recurring: true, date: prevMonth } });
  const after = await recurringCostRunRate(now);
  t("recurringCostRunRate: a recurring expense dated in the prior complete month increases the run-rate by exactly its amount", after.pence === before.pence + 4200 && after.count === before.count + 1);
  await db.expense.delete({ where: { id: recurringExpense.id } });

  await wipeSettings();
  console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED");
  process.exit(fail ? 1 : 0);
})();
