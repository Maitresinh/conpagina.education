import { createHash } from "node:crypto";
import {
  db, annotation, document, group, groupMember, user, notification,
  commentAlertPreference, commentAlertDelivery, eq, and, sql,
} from "@lectio/db";
import { applicationOrigin, defaultAlertPreferences, nextDigestAt, renderAlertEmail, wantsAlert, type AlertEntry, type AlertPreferences } from "./alert-content";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function queueEmail(tx: Transaction, recipientId: string, annotationId: string, frequency: "immediate" | "daily", now: Date) {
  const scheduledAt = frequency === "daily" ? nextDigestAt(now) : now;
  const id = createHash("sha256").update(`${recipientId}:${frequency}:${frequency === "daily" ? scheduledAt.toISOString() : annotationId}`).digest("hex");
  await tx.insert(commentAlertDelivery).values({
    id, userId: recipientId, frequency, annotationIds: [annotationId], scheduledAt, nextAttemptAt: scheduledAt,
  }).onConflictDoUpdate({
    target: commentAlertDelivery.id,
    set: { annotationIds: sql`${commentAlertDelivery.annotationIds} || ${JSON.stringify([annotationId])}::jsonb` },
    setWhere: eq(commentAlertDelivery.status, "pending"),
  });
}

// Called in the same transaction as the new annotation, so no comment can lose its alert.
export async function enqueueCommentAlerts(tx: Transaction, annotationId: string, now = new Date()) {
  const [event] = await tx.select({ annotation, document, group, author: user.name })
    .from(annotation).innerJoin(document, eq(document.id, annotation.documentId))
    .innerJoin(group, eq(group.id, document.groupId)).innerJoin(user, eq(user.id, annotation.userId))
    .where(eq(annotation.id, annotationId));
  if (!event || event.annotation.isGroupVisible !== "true" || !event.annotation.comment?.trim()) return;
  const members = await tx.select({ userId: groupMember.userId }).from(groupMember).where(eq(groupMember.groupId, event.group.id));
  const recipients = new Set([...members.map(m => m.userId), event.group.teacherId]);
  recipients.delete(event.annotation.userId);
  for (const recipientId of recipients) {
    const threadId = event.annotation.parentId || annotationId;
    await tx.insert(notification).values({
      id: crypto.randomUUID(), userId: recipientId, type: "new_annotation",
      title: `${event.author} — ${event.document.title}`,
      message: event.annotation.comment,
      actionUrl: `/read/${encodeURIComponent(event.document.id)}?annotation=${encodeURIComponent(threadId)}`,
      resourceId: annotationId,
    });
    const [saved] = await tx.select().from(commentAlertPreference).where(eq(commentAlertPreference.userId, recipientId));
    const prefs = saved || defaultAlertPreferences;
    if (wantsAlert(prefs, event.group.id, !!event.annotation.parentId)) {
      await queueEmail(tx, recipientId, annotationId, prefs.emailFrequency as "immediate" | "daily", now);
    }
  }
}

export type MailTransport = (mail: { to: string; subject: string; text: string; html: string }, idempotencyKey: string) => Promise<string>;

export const sendCommentEmail: MailTransport = async (mail, idempotencyKey) => {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error("Comment email service is not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, ...mail }),
  });
  if (!response.ok) throw new Error(`Mail provider HTTP ${response.status}`);
  const result = await response.json() as { id?: string };
  if (!result.id) throw new Error("Mail provider returned no delivery ID");
  return result.id;
};

async function visibleEntry(tx: Transaction, annotationId: string, recipientId: string, prefs: AlertPreferences): Promise<AlertEntry | null> {
  const [event] = await tx.select({ annotation, document, group, author: user.name })
    .from(annotation).innerJoin(document, eq(document.id, annotation.documentId))
    .innerJoin(group, eq(group.id, document.groupId)).innerJoin(user, eq(user.id, annotation.userId))
    .where(eq(annotation.id, annotationId));
  if (!event || event.annotation.isGroupVisible !== "true" || !event.annotation.comment?.trim() || event.annotation.userId === recipientId || !wantsAlert(prefs, event.group.id, !!event.annotation.parentId)) return null;
  const [membership] = await tx.select().from(groupMember).where(and(eq(groupMember.groupId, event.group.id), eq(groupMember.userId, recipientId)));
  if (!membership && event.group.teacherId !== recipientId) return null;
  let parentComment: string | null = null;
  if (event.annotation.parentId) {
    const [parent] = await tx.select().from(annotation).where(eq(annotation.id, event.annotation.parentId));
    if (!parent || parent.documentId !== event.document.id || parent.isGroupVisible !== "true") return null;
    parentComment = parent.comment;
  }
  return { author: event.author, book: event.document.title, group: event.group.name, createdAt: event.annotation.createdAt,
    quote: event.annotation.selectedText, comment: event.annotation.comment, parentComment,
    documentId: event.document.id, threadId: event.annotation.parentId || annotationId };
}

// A committed lease and frozen payload survive crashes; provider idempotency covers an unacknowledged send.
export async function processCommentAlert(transport: MailTransport = sendCommentEmail, now = new Date()): Promise<boolean> {
  const claim = await db.transaction(async tx => {
    const [job] = await tx.select().from(commentAlertDelivery)
      .where(and(eq(commentAlertDelivery.status, "pending"), sql`${commentAlertDelivery.nextAttemptAt} <= ${now}`))
      .orderBy(commentAlertDelivery.nextAttemptAt).limit(1).for("update", { skipLocked: true });
    if (!job) return { kind: "idle" as const };
    const finish = async (status: "sent" | "cancelled" | "failed", extra = {}) => {
      await tx.update(commentAlertDelivery).set({ status, ...extra }).where(eq(commentAlertDelivery.id, job.id));
    };
    const [recipient] = await tx.select().from(user).where(eq(user.id, job.userId));
    const [prefs] = await tx.select().from(commentAlertPreference).where(eq(commentAlertPreference.userId, job.userId));
    if (!recipient || !prefs || prefs.emailFrequency === "off") { await finish("cancelled", { mailContent: null }); return { kind: "skipped" as const }; }
    if (job.frequency !== prefs.emailFrequency) {
      if (!job.firstAttemptAt) {
        for (const id of new Set(job.annotationIds)) await queueEmail(tx, job.userId, id, prefs.emailFrequency, now);
      }
      await finish("cancelled", { mailContent: null }); return { kind: "skipped" as const };
    }
    // Resend deduplicates for 24h. Stop before that window expires instead of risking duplicate delivery.
    if (job.firstAttemptAt && now.getTime() - job.firstAttemptAt.getTime() >= 23 * 3600000) {
      await finish("failed", { mailContent: null, lastError: "Delivery could not be confirmed within 23 hours" }); return { kind: "skipped" as const };
    }
    const entries: AlertEntry[] = [];
    const visibleIds: string[] = [];
    for (const id of new Set(job.annotationIds)) {
      const entry = await visibleEntry(tx, id, job.userId, prefs);
      if (entry) { entries.push(entry); visibleIds.push(id); }
    }
    if (!entries.length || (job.mailContent && (entries.length !== new Set(job.annotationIds).size || recipient.email !== job.mailContent.to))) {
      await finish("cancelled", { mailContent: null }); return { kind: "skipped" as const };
    }
    const mail = job.mailContent || { to: recipient.email, ...renderAlertEmail(entries, applicationOrigin(process.env.APP_URL)) };
    await tx.update(commentAlertDelivery).set({
      mailContent: mail, annotationIds: visibleIds, attempts: job.attempts + 1, firstAttemptAt: job.firstAttemptAt || now,
      nextAttemptAt: new Date(now.getTime() + 5 * 60000),
    }).where(eq(commentAlertDelivery.id, job.id));
    return { kind: "send" as const, job, mail };
  });
  if (claim.kind === "idle") return false;
  if (claim.kind === "skipped") return true;
  const { job, mail } = claim;
  const ownedLease = and(eq(commentAlertDelivery.id, job.id), eq(commentAlertDelivery.status, "pending"), eq(commentAlertDelivery.attempts, job.attempts + 1));
  try {
    const providerId = await transport(mail, `comment-alert/${job.id}`);
    await db.update(commentAlertDelivery).set({ status: "sent", sentAt: now, providerId, mailContent: null, lastError: null }).where(ownedLease);
  } catch (error) {
    // Do not record provider payloads, recipient addresses or pupil comments in logs.
    await db.update(commentAlertDelivery).set({
      nextAttemptAt: new Date(now.getTime() + Math.min(3600000, 60000 * 2 ** Math.min(job.attempts, 6))),
      lastError: error instanceof Error && /^Mail provider HTTP \d+$/.test(error.message) ? error.message : "Email delivery failed; check service configuration",
    }).where(ownedLease);
  }
  return true;
}

export function startCommentAlertWorker() {
  if (process.env.COMMENT_ALERTS_ENABLED !== "true") return;
  applicationOrigin(process.env.APP_URL);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { for (let i = 0; i < 20 && await processCommentAlert(); i++); }
    catch { console.error("Comment alert worker failed; check database and migration status"); }
    finally { running = false; }
  };
  void tick();
  const timer = setInterval(() => { void tick(); }, 15000);
  timer.unref();
}
