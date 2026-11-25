import { beforeAll, beforeEach, afterAll, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { drizzle } from "drizzle-orm/pglite";
import * as operators from "drizzle-orm";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as schema from "../src/schema";
import { applicationOrigin, defaultAlertPreferences, nextDigestAt, renderAlertEmail, wantsAlert } from "../../api/src/lib/alert-content";

const pg = new PGlite();
const db = drizzle(pg, { schema });
mock.module("@lectio/db", () => ({ ...schema, ...operators, db }));
const { enqueueCommentAlerts, processCommentAlert } = await import("../../api/src/lib/comment-alerts");
const { readingRouter } = await import("../../api/src/routers/reading");
const { notificationsRouter } = await import("../../api/src/routers/notifications");
const { documentsRouter } = await import("../../api/src/routers/documents");
const { eq } = operators;
const now = new Date("2026-11-25T12:00:00Z");
const transaction = (fn: any) => db.transaction(fn);
const context = (id: string) => ({ session: { user: { id, email: `${id}@example.test`, role: id === "teacher" ? "TEACHER" : "STUDENT" } } }) as any;
const reader = (id = "pupil") => readingRouter.createCaller(context(id));
const prefs = (id = "teacher") => notificationsRouter.createCaller(context(id));

beforeAll(async () => {
  const baseline = Object.fromEntries(Object.entries(schema).filter(([key]) => !key.startsWith("commentAlert")));
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(baseline));
  for (const statement of statements) await pg.exec(statement);
  await pg.exec(await Bun.file(new URL("../src/migrations/0010_comment_alerts.sql", import.meta.url)).text());
  process.env.APP_URL = "https://education.example.test";
}, 30000);
afterAll(async () => { await pg.close(); });
beforeEach(async () => {
  await pg.exec('TRUNCATE "user" CASCADE');
  await db.insert(schema.user).values(["teacher", "pupil", "peer", "outsider"].map(id => ({ id, name: id, email: `${id}@example.test`, emailVerified: true })));
  await db.insert(schema.group).values({ id: "class", name: "Classe de test", teacherId: "teacher", inviteCode: "TEST1234" });
  await db.insert(schema.groupMember).values(["teacher", "pupil", "peer"].map(userId => ({ groupId: "class", userId })));
  await db.insert(schema.document).values({ id: "book", title: "Roman de test", filename: "test.epub", filepath: "uploads/test.epub", ownerId: "teacher", groupId: "class" });
  await prefs().updatePreferences({ ...defaultAlertPreferences, emailFrequency: "immediate" });
});

async function event(id = "comment", parentId: string | null = null) {
  await transaction(async (tx: any) => {
    await tx.insert(schema.annotation).values({ id, userId: "pupil", documentId: "book", parentId, cfiRange: "epubcfi(test)", selectedText: "Un passage complet.", comment: `Texte intégral ${id}`, isGroupVisible: "true" });
    await enqueueCommentAlerts(tx, id, now);
  });
}
const jobs = () => db.select().from(schema.commentAlertDelivery);

for (const operation of ["deleteBook", "removeBookFromGroup"] as const) {
  test(`${operation} preserves the shared EPUB and annotations on other copies`, async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "conpagina-shared-book-"));
    const filepath = path.join(directory, "shared.epub");
    try {
      await Bun.write(filepath, "shared book content");
      await db.update(schema.document).set({ filepath }).where(eq(schema.document.id, "book"));
      await db.insert(schema.document).values({ id: "copy", title: "Copie", filename: "shared.epub", filepath, ownerId: "teacher", groupId: "class" });
      await db.update(schema.groupMember).set({ role: "OWNER" }).where(eq(schema.groupMember.userId, "teacher"));
      await event();
      const documents = documentsRouter.createCaller(context("teacher"));
      if (operation === "deleteBook") await documents.deleteBook({ id: "copy" });
      else await documents.removeBookFromGroup({ bookId: "copy", groupId: "class" });
      expect(await Bun.file(filepath).text()).toBe("shared book content");
      expect((await db.select().from(schema.document)).map(book => book.id)).toEqual(["book"]);
      expect((await db.select().from(schema.annotation)).map(note => note.id)).toEqual(["comment"]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test("comment creation queues teacher mail atomically and excludes self/unsubscribed recipients", async () => {
  const result = await reader().createAnnotation({ documentId: "book", cfiRange: "epubcfi(test)", selectedText: "Passage", comment: "Le commentaire" });
  expect((await jobs()).map(j => j.userId)).toEqual(["teacher"]);
  expect((await jobs())[0]!.annotationIds).toEqual([result.id]);
  expect((await db.select().from(schema.notification)).map(n => n.userId).sort()).toEqual(["peer", "teacher"]);
});

test("highlight without a comment and private annotations do not send alerts", async () => {
  await reader().createAnnotation({ documentId: "book", cfiRange: "epubcfi(test)", selectedText: "Passage" });
  await db.insert(schema.annotation).values({ id: "private", userId: "pupil", documentId: "book", cfiRange: "test", selectedText: "Privé", comment: "Secret", isGroupVisible: "false" });
  await transaction((tx: any) => enqueueCommentAlerts(tx, "private", now));
  expect(await jobs()).toHaveLength(0);
});

test("adding the first comment to a highlight sends an alert, ordinary edits do not", async () => {
  const { id } = await reader().createAnnotation({ documentId: "book", cfiRange: "epubcfi(test)", selectedText: "Passage" });
  await reader().updateAnnotation({ id, comment: "Premier commentaire" });
  expect(await jobs()).toHaveLength(1);
  await reader().updateAnnotation({ id, comment: "Correction du commentaire" });
  expect(await jobs()).toHaveLength(1);
});

test("full content is escaped and reply link opens the root thread", () => {
  const long = "Contenu complet <script> & texte\n".repeat(100);
  const mail = renderAlertEmail([{ author: "Élève <A>", book: "Un roman", group: "Classe", createdAt: now, quote: long, comment: long, parentComment: "Parent", documentId: "book", threadId: "root" }], "https://education.example.test");
  expect(mail.text).toContain(long);
  expect(mail.html).not.toContain("<script>");
  expect(mail.html).toContain("&lt;script&gt;");
  expect(mail.html).toContain("/read/book?annotation=root");
  expect(mail.text).toContain("↩ Répondre");
  expect(() => applicationOrigin("javascript:alert(1)")).toThrow();
});

test("daily digest groups full comments into one email at 09:00 Paris", async () => {
  await prefs().updatePreferences({ ...defaultAlertPreferences, emailFrequency: "daily" });
  await event("one"); await event("two");
  expect(await jobs()).toHaveLength(1);
  const send = mock(async () => "mail-id");
  expect(await processCommentAlert(send, now)).toBe(false);
  const due = nextDigestAt(now);
  await processCommentAlert(send, due);
  expect(send).toHaveBeenCalledTimes(1);
  const mail = send.mock.calls[0]![0] as any;
  expect(mail.text).toContain("Texte intégral one");
  expect(mail.text).toContain("Texte intégral two");
  expect((await jobs())[0]!.status).toBe("sent");
});

test("daily schedule follows daylight-saving time", () => {
  expect(nextDigestAt(new Date("2026-03-28T10:00:00Z")).toISOString()).toBe("2026-03-29T07:00:00.000Z");
  expect(nextDigestAt(new Date("2026-10-24T10:00:00Z")).toISOString()).toBe("2026-10-25T08:00:00.000Z");
});

test("opt-out and removed membership cancel pending emails", async () => {
  await event();
  await prefs().updatePreferences(defaultAlertPreferences);
  const send = mock(async () => "unused");
  await processCommentAlert(send, now);
  expect(send).not.toHaveBeenCalled();
  await db.insert(schema.commentAlertPreference).values({ userId: "peer", emailFrequency: "immediate" });
  await event("later");
  await db.delete(schema.groupMember).where(eq(schema.groupMember.userId, "peer"));
  await processCommentAlert(send, now);
  expect(send).not.toHaveBeenCalled();
});

test("failed sends retry with a frozen payload and idempotency key, then stop after success", async () => {
  await event();
  let first: any;
  const fail = mock(async (mail: any, key: string) => { first = { mail, key }; throw new Error("network timeout"); });
  await processCommentAlert(fail, now);
  expect((await jobs())[0]!.firstAttemptAt?.toISOString()).toBe(now.toISOString());
  await db.update(schema.annotation).set({ comment: "Edited after first attempt" }).where(eq(schema.annotation.id, "comment"));
  const retry = mock(async (mail: any, key: string) => { expect({ mail, key }).toEqual(first); return "provider-id"; });
  await processCommentAlert(retry, new Date(now.getTime() + 60000));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(await processCommentAlert(retry, new Date(now.getTime() + 120000))).toBe(false);
  expect((await jobs())[0]!.mailContent).toBeNull();
});

test("a claimed job is not concurrently sent twice", async () => {
  await event();
  let release!: () => void;
  let started!: () => void;
  const start = new Promise<void>(r => { started = r; });
  const hold = new Promise<void>(r => { release = r; });
  const send = mock(async () => { started(); await hold; return "id"; });
  const first = processCommentAlert(send, now);
  await start;
  expect(await processCommentAlert(send, now)).toBe(false);
  release(); await first;
  expect(send).toHaveBeenCalledTimes(1);
});

test("unconfirmed sends are not retried beyond provider deduplication window", async () => {
  await event();
  await processCommentAlert(async () => { throw new Error("timeout"); }, now);
  const send = mock(async () => "unused");
  await processCommentAlert(send, new Date(now.getTime() + 24 * 3600000));
  expect(send).not.toHaveBeenCalled();
  expect((await jobs())[0]!.status).toBe("failed");
});

test("reply access checks reject cross-book and private threads", async () => {
  await event();
  await expect(reader().replyToAnnotation({ documentId: "other", parentId: "comment", comment: "No" })).rejects.toThrow();
  await db.update(schema.annotation).set({ isGroupVisible: "false" }).where(eq(schema.annotation.id, "comment"));
  await expect(reader("peer").replyToAnnotation({ documentId: "book", parentId: "comment", comment: "No" })).rejects.toThrow();
  await expect(reader("outsider").getAnnotationReplies({ annotationId: "comment" })).rejects.toThrow();
});

test("reply preferences and class selection are respected", async () => {
  expect(wantsAlert({ ...defaultAlertPreferences, emailFrequency: "immediate", replies: false }, "class", true)).toBe(false);
  expect(wantsAlert({ ...defaultAlertPreferences, emailFrequency: "immediate", groupIds: ["another"] }, "class", false)).toBe(false);
  await expect(prefs().updatePreferences({ ...defaultAlertPreferences, groupIds: ["forbidden"] })).rejects.toThrow();
  await event();
  const result = await reader("peer").replyToAnnotation({ parentId: "comment", documentId: "book", comment: "Une réponse" });
  expect((await jobs()).some(j => j.annotationIds.includes(result.id))).toBe(true);
});

test("frequency changes before sending regroup existing alerts without sending immediately", async () => {
  await event();
  await prefs().updatePreferences({ ...defaultAlertPreferences, emailFrequency: "daily" });
  const send = mock(async () => "id");
  await processCommentAlert(send, now);
  expect(send).not.toHaveBeenCalled();
  expect((await jobs()).filter(j => j.status === "pending")).toHaveLength(1);
  await processCommentAlert(send, nextDigestAt(now));
  expect(send).toHaveBeenCalledTimes(1);
});

test("deleting a comment before delivery removes its content from the digest", async () => {
  await prefs().updatePreferences({ ...defaultAlertPreferences, emailFrequency: "daily" });
  await event("deleted"); await event("kept");
  await db.delete(schema.annotation).where(eq(schema.annotation.id, "deleted"));
  const send = mock(async (mail: any) => { expect(mail.text).not.toContain("Texte intégral deleted"); expect(mail.text).toContain("Texte intégral kept"); return "id"; });
  await processCommentAlert(send, nextDigestAt(now));
  expect(send).toHaveBeenCalledTimes(1);
});


test("PDF passage and page comments preserve anchors, replies, progress, rights and full-content alerts", async () => {
  await db.update(schema.document).set({ mimeType: "application/pdf", filename: "test.pdf", filepath: "uploads/test.pdf" }).where(eq(schema.document.id, "book"));
  const anchor = 'pdf:v1:{"page":3,"rects":[{"x":0.1,"y":0.2,"width":0.3,"height":0.02}]}';
  const root = await reader().createAnnotation({ documentId: "book", cfiRange: anchor, selectedText: "Passage intégral du PDF", comment: "Une question sur ce passage." });
  const notes = await reader().getAnnotations({ documentId: "book" });
  expect(notes.find(note => note.id === root.id)?.cfiRange).toBe(anchor);
  const reply = await reader("teacher").replyToAnnotation({ documentId: "book", parentId: root.id, comment: "Voici une réponse." });
  const replies = await reader().getAnnotationReplies({ annotationId: root.id });
  expect(replies.find(note => note.id === reply.id)?.cfiRange).toBe(anchor);
  const pageComment = await reader("teacher").createAnnotation({ documentId: "book", cfiRange: 'pdf:v1:{"page":4,"rects":[]}', selectedText: "Page 4", comment: "Commentaire sur une page scannée." });
  const pageNotes = await reader().getAnnotations({ documentId: "book" });
  expect(pageNotes.find(note => note.id === pageComment.id)?.cfiRange).toContain('"page":4');
  await reader().saveProgress({ documentId: "book", currentLocation: "pdf:page:3", progressPercentage: 50 });
  expect((await reader().getProgress({ documentId: "book" }))?.currentLocation).toBe("pdf:page:3");
  await expect(reader("outsider").getAnnotations({ documentId: "book" })).rejects.toThrow();
  await expect(reader("outsider").createAnnotation({ documentId: "book", cfiRange: anchor, selectedText: "Passage", comment: "Interdit" })).rejects.toThrow();
  const send = mock(async () => "pdf-mail-id");
  await processCommentAlert(send, new Date(Date.now() + 60000));
  expect(send).toHaveBeenCalledTimes(1);
  const mail = send.mock.calls[0]![0] as any;
  expect(mail.text).toContain("Passage intégral du PDF");
  expect(mail.text).toContain("Une question sur ce passage.");
  expect(mail.text).toContain(`/read/book?annotation=${root.id}`);
});
