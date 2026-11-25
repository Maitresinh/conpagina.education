import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  db,
  document,
  groupMember,
  group,
  user,
  annotation,
  readingProgress,
  readerSettings,
  eq,
  and,
  or,
  isNull,
  desc
} from "@lectio/db";
import { protectedProcedure, router } from "../index";
import { randomUUID } from "crypto";
import { enqueueCommentAlerts } from "../lib/comment-alerts";

async function assertCanAccessDocument(params: {
  documentId: string;
  userId: string;
}) {
  const { documentId, userId } = params;

  const [doc] = await db
    .select()
    .from(document)
    .where(eq(document.id, documentId))
    .limit(1);

  if (!doc) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
  }

  // Propriétaire => OK
  if (doc.ownerId === userId) {
    return doc;
  }

  // Livre de groupe => vérifier membership
  if (doc.groupId) {
    const [membership] = await db
      .select()
      .from(groupMember)
      .where(and(eq(groupMember.groupId, doc.groupId), eq(groupMember.userId, userId)))
      .limit(1);

    if (membership) {
      return doc;
    }
  }

  throw new TRPCError({ code: "FORBIDDEN", message: "You don't have access to this document" });
}

// Vérifier si le groupe du document est archivé OU si la deadline est passée (bloque les interactions)
async function assertGroupNotArchived(documentId: string) {
  const [doc] = await db
    .select()
    .from(document)
    .where(eq(document.id, documentId))
    .limit(1);

  if (!doc || !doc.groupId) {
    return; // Pas un document de groupe, pas de restriction
  }

  const [docGroup] = await db
    .select()
    .from(group)
    .where(eq(group.id, doc.groupId))
    .limit(1);

  // Vérifier si archivé manuellement
  if (docGroup?.isArchived) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Ce groupe est archivé. Les commentaires et interactions sont désactivés.",
    });
  }

  // Vérifier si la deadline est passée (même si autoArchive est désactivé)
  if (docGroup?.deadline && new Date(docGroup.deadline) < new Date()) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "L'échéance de ce groupe est passée. Les commentaires et interactions sont désactivés.",
    });
  }
}

export const readingRouter = router({
  // Sauvegarder/mettre à jour la progression de lecture
  saveProgress: protectedProcedure
    .input(z.object({
      documentId: z.string(),
      currentLocation: z.string(),
      progressPercentage: z.number().min(0).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertCanAccessDocument({ documentId: input.documentId, userId: ctx.session.user.id });

      // Chercher une progression existante
      const [existing] = await db
        .select()
        .from(readingProgress)
        .where(
          and(
            eq(readingProgress.userId, ctx.session.user.id),
            eq(readingProgress.documentId, input.documentId)
          )
        )
        .limit(1);

      if (existing) {
        // Mettre à jour
        await db
          .update(readingProgress)
          .set({
            currentLocation: input.currentLocation,
            progressPercentage: input.progressPercentage,
            lastReadAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(readingProgress.id, existing.id));

        return { success: true, id: existing.id };
      } else {
        // Créer
        const id = randomUUID();
        await db.insert(readingProgress).values({
          id,
          userId: ctx.session.user.id,
          documentId: input.documentId,
          currentLocation: input.currentLocation,
          progressPercentage: input.progressPercentage,
          lastReadAt: new Date(),
        });

        return { success: true, id };
      }
    }),

  // Récupérer la progression de lecture
  getProgress: protectedProcedure
    .input(z.object({ documentId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertCanAccessDocument({ documentId: input.documentId, userId: ctx.session.user.id });

      const [progress] = await db
        .select()
        .from(readingProgress)
        .where(
          and(
            eq(readingProgress.userId, ctx.session.user.id),
            eq(readingProgress.documentId, input.documentId)
          )
        )
        .limit(1);

      return progress || null;
    }),

  // Créer une annotation
  createAnnotation: protectedProcedure
    .input(z.object({
      documentId: z.string(),
      cfiRange: z.string(),
      selectedText: z.string(),
      highlightColor: z.string().default("#fef08a"),
      comment: z.string().optional(),
      context: z.object({
        chapter: z.string().optional(),
        section: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const doc = await assertCanAccessDocument({ documentId: input.documentId, userId: ctx.session.user.id });

      // Vérifier si le groupe est archivé (bloque les nouvelles annotations)
      await assertGroupNotArchived(input.documentId);

      const id = randomUUID();
      await db.transaction(async tx => {
        await tx.insert(annotation).values({
          id,
          userId: ctx.session.user.id,
          documentId: input.documentId,
          isGroupVisible: doc.groupId ? "true" : "false",
          cfiRange: input.cfiRange,
          selectedText: input.selectedText,
          highlightColor: input.highlightColor,
          comment: input.comment,
          context: input.context as any,
        });
        await enqueueCommentAlerts(tx, id);
      });

      return { success: true, id };
    }),

  // Vérifier si le document appartient à un groupe archivé
  isDocumentArchived: protectedProcedure
    .input(z.object({ documentId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertCanAccessDocument({ documentId: input.documentId, userId: ctx.session.user.id });

      const [doc] = await db
        .select()
        .from(document)
        .where(eq(document.id, input.documentId))
        .limit(1);

      if (!doc || !doc.groupId) {
        return { isArchived: false, isDeadlinePassed: false, isReadOnly: false, deadline: null, groupName: null };
      }

      const [docGroup] = await db
        .select()
        .from(group)
        .where(eq(group.id, doc.groupId))
        .limit(1);

      const isDeadlinePassed = docGroup?.deadline ? new Date(docGroup.deadline) < new Date() : false;

      return {
        isArchived: docGroup?.isArchived || false,
        isDeadlinePassed,
        isReadOnly: (docGroup?.isArchived || isDeadlinePassed) || false,
        deadline: docGroup?.deadline || null,
        groupName: docGroup?.name || null,
      };
    }),

  // Récupérer toutes les annotations d'un document
  getAnnotations: protectedProcedure
    .input(z.object({ documentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const doc = await assertCanAccessDocument({ documentId: input.documentId, userId: ctx.session.user.id });

      // Livre perso: uniquement mes annotations (avec info auteur)
      if (!doc.groupId) {
        const rows = await db
          .select({
            annotation: annotation,
            author: {
              id: user.id,
              name: user.name,
              email: user.email,
              image: user.image,
            },
          })
          .from(annotation)
          .innerJoin(user, eq(annotation.userId, user.id))
          .where(and(
            eq(annotation.userId, ctx.session.user.id),
            eq(annotation.documentId, input.documentId),
            // Exclure les réponses (elles ont un parentId)
            isNull(annotation.parentId)
          ))
          .orderBy(desc(annotation.createdAt));

        // Compter les réponses pour chaque annotation
        const annotationsWithCount = await Promise.all(
          rows.map(async (r) => {
            const replies = await db
              .select({ id: annotation.id })
              .from(annotation)
              .where(eq(annotation.parentId, r.annotation.id));

            return {
              ...r.annotation,
              author: r.author,
              replyCount: replies.length,
            };
          })
        );

        return annotationsWithCount;
      }

      // Livre de groupe: mes annotations + annotations partagées du groupe
      const rows = await db
        .select({
          annotation: annotation,
          author: {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
          },
        })
        .from(annotation)
        .innerJoin(user, eq(annotation.userId, user.id))
        .where(
          and(
            eq(annotation.documentId, input.documentId),
            or(eq(annotation.userId, ctx.session.user.id), eq(annotation.isGroupVisible, "true")),
            // Exclure les réponses (elles ont un parentId)
            isNull(annotation.parentId)
          )
        )
        .orderBy(desc(annotation.createdAt));

      // Compter les réponses pour chaque annotation
      const annotationsWithCount = await Promise.all(
        rows.map(async (r) => {
          const replies = await db
            .select({ id: annotation.id })
            .from(annotation)
            .where(eq(annotation.parentId, r.annotation.id));

          return {
            ...r.annotation,
            author: r.author,
            replyCount: replies.length,
          };
        })
      );

      return annotationsWithCount;
    }),

  // Mettre à jour une annotation
  updateAnnotation: protectedProcedure
    .input(z.object({
      id: z.string(),
      highlightColor: z.string().optional(),
      comment: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Vérifier que l'annotation appartient à l'utilisateur
      const [annot] = await db
        .select()
        .from(annotation)
        .where(eq(annotation.id, input.id))
        .limit(1);

      if (!annot || annot.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have access to this annotation",
        });
      }

      // Vérifier si le groupe est archivé
      await assertGroupNotArchived(annot.documentId);

      await db.transaction(async tx => {
        await tx
          .update(annotation)
          .set({
            highlightColor: input.highlightColor,
            comment: input.comment,
            updatedAt: new Date(),
          })
          .where(eq(annotation.id, input.id));
        if (!annot.comment?.trim() && input.comment?.trim()) await enqueueCommentAlerts(tx, input.id);
      });

      return { success: true };
    }),

  // Supprimer une annotation
  deleteAnnotation: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Récupérer l'annotation et vérifier les droits
      const [annot] = await db
        .select({
          annotation: annotation,
          document: document,
        })
        .from(annotation)
        .innerJoin(document, eq(annotation.documentId, document.id))
        .where(eq(annotation.id, input.id))
        .limit(1);

      if (!annot) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Annotation not found",
        });
      }

      // Vérifier les permissions :
      // - L'auteur de l'annotation peut toujours supprimer
      const isAuthor = annot.annotation.userId === ctx.session.user.id;

      // - Le professeur du groupe peut supprimer toutes les annotations/réponses des élèves
      let isTeacher = false;
      if (annot.document.groupId) {
        const [groupInfo] = await db
          .select({ teacherId: group.teacherId })
          .from(group)
          .where(eq(group.id, annot.document.groupId))
          .limit(1);

        if (groupInfo) {
          isTeacher = groupInfo.teacherId === ctx.session.user.id;
        }
      }

      if (!isAuthor && !isTeacher) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Seul l'auteur ou le professeur peut supprimer cette annotation",
        });
      }

      // Si le groupe est archivé, seul le professeur peut supprimer (modération)
      if (annot.document.groupId && isAuthor && !isTeacher) {
        const [groupInfo] = await db
          .select({ isArchived: group.isArchived })
          .from(group)
          .where(eq(group.id, annot.document.groupId))
          .limit(1);

        if (groupInfo?.isArchived) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Ce groupe est archivé. Seul le professeur peut supprimer des annotations.",
          });
        }
      }

      // Si c'est une annotation parent, supprimer aussi toutes les réponses
      if (!annot.annotation.parentId) {
        await db.delete(annotation).where(eq(annotation.parentId, input.id));
      }

      await db.delete(annotation).where(eq(annotation.id, input.id));

      return { success: true };
    }),

  // Créer une réponse à une annotation (thread)
  replyToAnnotation: protectedProcedure
    .input(z.object({
      parentId: z.string(),
      comment: z.string(),
      documentId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Vérifier que l'annotation parent existe
      const [parent] = await db
        .select()
        .from(annotation)
        .where(eq(annotation.id, input.parentId))
        .limit(1);

      if (!parent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Annotation parent not found",
        });
      }

      if (parent.documentId !== input.documentId || parent.parentId ||
          (parent.isGroupVisible !== "true" && parent.userId !== ctx.session.user.id)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cette discussion n'est pas accessible." });
      }

      // Vérifier l'accès au document
      await assertCanAccessDocument({ documentId: input.documentId, userId: ctx.session.user.id });

      // Vérifier si le groupe est archivé (bloque les nouvelles réponses)
      await assertGroupNotArchived(input.documentId);

      const id = randomUUID();
      await db.transaction(async tx => {
        await tx.insert(annotation).values({
          id,
          userId: ctx.session.user.id,
          documentId: input.documentId,
          parentId: input.parentId,
          isGroupVisible: parent.isGroupVisible, // Hérite de la visibilité du parent
          cfiRange: parent.cfiRange, // Même position
          selectedText: parent.selectedText,
          highlightColor: parent.highlightColor,
          comment: input.comment,
          context: parent.context as any,
        });
        await enqueueCommentAlerts(tx, id);
      });

      return { success: true, id };
    }),

  // Récupérer les réponses d'une annotation
  getAnnotationReplies: protectedProcedure
    .input(z.object({ annotationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [parent] = await db.select().from(annotation).where(eq(annotation.id, input.annotationId)).limit(1);
      if (!parent) throw new TRPCError({ code: "NOT_FOUND" });
      await assertCanAccessDocument({ documentId: parent.documentId, userId: ctx.session.user.id });
      if (parent.isGroupVisible !== "true" && parent.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const rows = await db
        .select({
          annotation: annotation,
          author: {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
          },
        })
        .from(annotation)
        .innerJoin(user, eq(annotation.userId, user.id))
        .where(eq(annotation.parentId, input.annotationId))
        .orderBy(annotation.createdAt);

      return rows.map((r) => ({
        ...r.annotation,
        author: r.author,
      }));
    }),

  // Paramètres de lecture
  getReaderSettings: protectedProcedure
    .query(async ({ ctx }) => {
      const [settings] = await db
        .select()
        .from(readerSettings)
        .where(eq(readerSettings.userId, ctx.session.user.id))
        .limit(1);

      // Retourner les paramètres par défaut si non configurés
      if (!settings) {
        return {
          fontSize: 16,
          theme: "light",
          lineHeight: 150,
          fontFamily: "system-ui",
          readingMode: "paginated" as const,
        };
      }

      return settings;
    }),

  updateReaderSettings: protectedProcedure
    .input(z.object({
      fontSize: z.number().min(8).max(32).optional(),
      theme: z.enum(["light", "dark", "sepia"]).optional(),
      lineHeight: z.number().min(100).max(250).optional(),
      fontFamily: z.string().optional(),
      readingMode: z.enum(["paginated", "scrolled"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select()
        .from(readerSettings)
        .where(eq(readerSettings.userId, ctx.session.user.id))
        .limit(1);

      if (existing) {
        // Mise à jour
        await db
          .update(readerSettings)
          .set({
            ...input,
            updatedAt: new Date(),
          })
          .where(eq(readerSettings.id, existing.id));
      } else {
        // Création
        const id = randomUUID();
        await db.insert(readerSettings).values({
          id,
          userId: ctx.session.user.id,
          fontSize: input.fontSize || 16,
          theme: input.theme || "light",
          lineHeight: input.lineHeight || 150,
          fontFamily: input.fontFamily || "system-ui",
          readingMode: input.readingMode || "paginated",
        });
      }

      return { success: true };
    }),

  // Get all annotations for a group (for annotation hub)
  getGroupAnnotations: protectedProcedure
    .input(z.object({
      groupId: z.string(),
      // Optional filters
      bookId: z.string().optional(),
      userId: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Verify user has access to group
      const userRole = ctx.session.user.role || "STUDENT";
      const isTeacher = userRole === "TEACHER" || userRole === "ADMIN";

      // Get the group and check if annotation hub is enabled
      const [foundGroup] = await db
        .select()
        .from(group)
        .where(eq(group.id, input.groupId))
        .limit(1);

      if (!foundGroup) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Group not found" });
      }

      // Check if user has access (is teacher or member)
      if (!isTeacher || foundGroup.teacherId !== ctx.session.user.id) {
        const [membership] = await db
          .select()
          .from(groupMember)
          .where(and(
            eq(groupMember.groupId, input.groupId),
            eq(groupMember.userId, ctx.session.user.id)
          ))
          .limit(1);

        if (!membership && foundGroup.teacherId !== ctx.session.user.id) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
      }

      // Check if annotation hub is enabled
      if (!(foundGroup as any).annotationHubEnabled) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Annotation hub is disabled for this group"
        });
      }

      // Get all documents in this group
      const groupDocuments = await db
        .select({ id: document.id, title: document.title })
        .from(document)
        .where(eq(document.groupId, input.groupId));

      const documentIds = groupDocuments.map(d => d.id);
      const documentMap = new Map(groupDocuments.map(d => [d.id, d.title]));

      if (documentIds.length === 0) {
        return { annotations: [], documents: groupDocuments };
      }

      // Build query for annotations
      // For teachers: get all annotations on group documents
      // For students: get their own + group-visible annotations
      let allAnnotations: any[] = [];

      for (const docId of documentIds) {
        // Apply bookId filter if specified
        if (input.bookId && docId !== input.bookId) continue;

        const docAnnotations = await db
          .select({
            annotation: annotation,
            author: {
              id: user.id,
              name: user.name,
              email: user.email,
            }
          })
          .from(annotation)
          .leftJoin(user, eq(annotation.userId, user.id))
          .where(eq(annotation.documentId, docId))
          .orderBy(desc(annotation.createdAt));

        for (const row of docAnnotations) {
          // Apply userId filter if specified
          if (input.userId && row.annotation.userId !== input.userId) continue;

          // Apply date filters if specified
          if (input.dateFrom) {
            const fromDate = new Date(input.dateFrom);
            if (row.annotation.createdAt < fromDate) continue;
          }
          if (input.dateTo) {
            const toDate = new Date(input.dateTo);
            if (row.annotation.createdAt > toDate) continue;
          }

          // Role-based visibility
          if (!isTeacher && foundGroup.teacherId !== ctx.session.user.id) {
            // Students only see their own or group-visible annotations
            if (row.annotation.userId !== ctx.session.user.id && !row.annotation.isGroupVisible) {
              continue;
            }
          }

          allAnnotations.push({
            ...row.annotation,
            author: row.author,
            bookTitle: documentMap.get(docId) || "Unknown",
          });
        }
      }

      return {
        annotations: allAnnotations,
        documents: groupDocuments
      };
    }),
});

