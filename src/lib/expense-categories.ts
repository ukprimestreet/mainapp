/**
 * Expense categories.
 *
 * These live in their own module because a `"use server"` file may only export async functions: Next.js
 * refuses to build when one exports a runtime value, and it did. Types are erased so they are fine to
 * export from a server-action file; an array like this is not.
 */
export const EXPENSE_CATEGORIES = ["HOSTING", "MARKETING", "SALES", "CONTENT", "CONTRACTORS", "PAYMENT_FEES", "OTHER"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
