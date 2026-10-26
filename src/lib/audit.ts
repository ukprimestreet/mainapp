import { db } from "./db";

/**
 * The audit log, with who did it.
 *
 * Before individual administrator accounts there was one shared password, so an audit row could only ever
 * say "admin". Now it names the person. Rows written before the migration keep a null actor, because
 * back-filling a name onto an action nobody can actually attribute would be worse than an honest gap.
 *
 * `audit()` resolves the current administrator itself, so a call site cannot forget to pass it. Where the
 * actor is not an administrator — a writer changing their own payee details, an owner accepting an
 * invitation, the nightly job — pass it explicitly.
 *
 * **Never** put a password, a password hash, a card number, a bank account or a customer's contact details
 * in `detail`. The log records *that* something happened and to which record; the sensitive value stays in
 * the one place it belongs. Reviewing a writer's bank details is itself an audited event, and what the log
 * says is who looked, not what they saw.
 */

export type Actor =
  | { kind: "ADMIN" | "SUPER_ADMIN"; id: string; email: string }
  | { kind: "AUTHOR" | "OWNER"; id: string; email: string | null }
  | { kind: "SYSTEM"; id?: undefined; email?: undefined };

export const SYSTEM: Actor = { kind: "SYSTEM" };

type Entry = { action: string; targetType: string; targetId: string; detail?: string | null };

/** Resolves the signed-in administrator, if there is one. Imported lazily to avoid a cycle with auth.ts. */
async function currentAdminActor(): Promise<Actor | null> {
  try {
    const { adminSession } = await import("./auth");
    const s = await adminSession();
    if (!s) return null;
    if (s.kind === "LEGACY") {
      // An honest record of the pre-migration state: authenticated, but not attributable to a person.
      return { kind: "SYSTEM" };
    }
    return { kind: s.admin.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "ADMIN", id: s.admin.id, email: s.admin.email };
  } catch { return null; }
}

/**
 * Writes an audit row. Resolves the administrator automatically unless an actor is given.
 *
 * Deliberately never throws: losing an audit row is bad, but failing the operation it was recording is
 * worse, and the operation has usually already happened by the time we get here.
 */
export async function audit(entry: Entry, actor?: Actor): Promise<void> {
  const who = actor ?? (await currentAdminActor()) ?? SYSTEM;
  await db.auditLog
    .create({
      data: {
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        detail: entry.detail ?? null,
        actorId: who.kind === "ADMIN" || who.kind === "SUPER_ADMIN" ? who.id : null,
        actorEmail: who.email ?? null,
        actorKind: who.kind,
      },
    })
    .catch(() => {});
}

/** Positional form, so the existing call sites read the same way they did. */
export const auditLog = (action: string, targetType: string, targetId: string, detail?: string | null, actor?: Actor) =>
  audit({ action, targetType, targetId, detail }, actor);

/** Who touched a record, newest first. */
export const auditFor = (targetType: string, targetId: string, take = 50) =>
  db.auditLog.findMany({ where: { targetType, targetId }, orderBy: { createdAt: "desc" }, take, include: { actor: { select: { name: true, email: true, role: true } } } });

/** What one administrator has done, for the account screen. */
export const auditByActor = (actorId: string, take = 100) =>
  db.auditLog.findMany({ where: { actorId }, orderBy: { createdAt: "desc" }, take });
