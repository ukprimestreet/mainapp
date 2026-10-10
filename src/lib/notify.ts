import { db } from "./db";

/**
 * In-app notifications. Email can be missed, filtered or bounce; a decision that only ever existed in an
 * inbox is a decision the recipient may never see. Every notification therefore also lands here.
 */
export type Audience = "AUTHOR" | "OWNER" | "ADMIN";
export type Kind = "DECISION" | "COMMISSION" | "ENQUIRY" | "REVIEW" | "PAYMENT" | "SYSTEM";

export const notify = (audience: Audience, subjectId: string, kind: Kind, title: string, body?: string, href?: string) =>
  db.notification.create({ data: { audience, subjectId, kind, title, body: body ?? null, href: href ?? null } });

export const unreadCount = (audience: Audience, subjectId: string) =>
  db.notification.count({ where: { audience, subjectId, readAt: null } });

export const listNotifications = (audience: Audience, subjectId: string, take = 30) =>
  db.notification.findMany({ where: { audience, subjectId }, orderBy: { createdAt: "desc" }, take });

export const markAllRead = (audience: Audience, subjectId: string) =>
  db.notification.updateMany({ where: { audience, subjectId, readAt: null }, data: { readAt: new Date() } });
