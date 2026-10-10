import { db } from "./db";
import { sha256 } from "./antispam";
import { setOwnerSession } from "./owner";

export type InviteState = "ok" | "expired" | "used" | "invalid";

/** Read-only: looking at the invitation page must never use the link up. */
export async function inviteState(token: string) {
  const row = await db.teamInvite.findUnique({
    where: { tokenHash: sha256(token) },
    include: { business: { select: { id: true, name: true } } },
  });
  if (!row) return { state: "invalid" as InviteState, invite: null };
  const state: InviteState = row.acceptedAt ? "used" : row.expiresAt.getTime() < Date.now() ? "expired" : "ok";
  return { state, invite: row };
}

/**
 * Accepts an invitation. Holding the emailed token is the same assurance as an owner sign-in link — it proves
 * control of the invited inbox — so accepting both grants access and signs the person in. Single use, enforced
 * atomically so two clicks cannot both win.
 */
export async function acceptInvite(token: string): Promise<{ ok: true; businessId: string } | { ok: false; message: string }> {
  const { state, invite } = await inviteState(token);
  if (!invite || state !== "ok") {
    return {
      ok: false,
      message:
        state === "used" ? "This invitation has already been used. If you need access again, ask them to send a new one."
        : state === "expired" ? "This invitation has expired. Ask them to send a new one — they last seven days."
        : "This invitation isn't valid.",
    };
  }

  const claimed = await db.teamInvite.updateMany({ where: { id: invite.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
  if (claimed.count !== 1) return { ok: false, message: "This invitation has already been used." };

  const email = invite.email.trim().toLowerCase();
  const owner =
    (await db.owner.findUnique({ where: { email } })) ??
    (await db.owner.create({ data: { email, name: email.split("@")[0] } }));

  await db.businessOwner.upsert({
    where: { ownerId_businessId: { ownerId: owner.id, businessId: invite.businessId } },
    create: { ownerId: owner.id, businessId: invite.businessId },
    update: {},
  });
  await db.auditLog.create({
    data: { action: "Team member added", targetType: "Business", targetId: invite.businessId, detail: `${email} accepted an invitation from ${invite.invitedBy}` },
  });
  await db.owner.update({ where: { id: owner.id }, data: { lastLoginAt: new Date() } });
  await setOwnerSession(owner.id, owner.sessionVersion);
  return { ok: true, businessId: invite.businessId };
}
