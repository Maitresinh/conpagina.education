import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { db, document, readingProgress, groupMember, group, user, eq, and, or, isNull, desc, sql, ilike, count } from "@lectio/db";
import { protectedProcedure, adminProcedure, teacherProcedure, router } from "../index";

export const documentsRouter = router({
  // Récupérer les livres personnels de l'utilisateur (exclut les livres publics et ceux réclamés)
  getMyBooks: protectedProcedure.query(async ({ ctx }) => {
    const books = await db
      .select()
      .from(document)
      .where(
        and(
          eq(document.ownerId, ctx.session.user.id),
          isNull(document.groupId), // Livres personnels uniquement
          eq(document.isPublic, "false"), // Exclure les livres publics
          or(
            isNull(document.claimedFromPublic),
            eq(document.claimedFromPublic, "false")
          ) // Exclure les livres réclamés depuis la bibliothèque publique
        )
      )
      .orderBy(desc(document.createdAt));

    return books;
  }),

  // Récupérer les livres personnels + progression de lecture de l'utilisateur (exclut les livres publics)
  getMyBooksWithProgress: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        book: document,
        progress: readingProgress,
      })
      .from(document)
      .leftJoin(
        readingProgress,
        and(
          eq(readingProgress.documentId, document.id),
          eq(readingProgress.userId, ctx.session.user.id)
        )
      )
      .where(
        and(
          eq(document.ownerId, ctx.session.user.id),
          isNull(document.groupId),
          eq(document.isPublic, "false") // Exclure les livres publics
        )
      )
      .orderBy(desc(document.createdAt));

    return rows.map((r) => ({
      ...r.book,
      progress: r.progress
        ? {
          id: r.progress.id,
          currentLocation: r.progress.currentLocation,
          progressPercentage: r.progress.progressPercentage,
          lastReadAt: r.progress.lastReadAt,
          updatedAt: r.progress.updatedAt,
        }
        : null,
    }));
  }),

  // Récupérer les livres d'un groupe
  getGroupBooks: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Vérifier que l'utilisateur est membre ou propriétaire du groupe
      const userRole = ctx.session.user.role || "STUDENT";

      if (userRole === "STUDENT") {
        // Vérifier l'appartenance au groupe
        const [membership] = await db
          .select()
          .from(groupMember)
          .where(
            and(
              eq(groupMember.groupId, input.groupId),
              eq(groupMember.userId, ctx.session.user.id)
            )
          )
          .limit(1);

        if (!membership) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have access to this group",
          });
        }
      }

      // Récupérer les livres du groupe avec progression
      const rows = await db
        .select({
          book: document,
          progress: readingProgress,
        })
        .from(document)
        .leftJoin(
          readingProgress,
          and(
            eq(readingProgress.documentId, document.id),
            eq(readingProgress.userId, ctx.session.user.id)
          )
        )
        .where(eq(document.groupId, input.groupId))
        .orderBy(desc(document.createdAt));

      return rows.map((r) => ({
        ...r.book,
        progress: r.progress
          ? {
            id: r.progress.id,
            currentLocation: r.progress.currentLocation,
            progressPercentage: r.progress.progressPercentage,
            lastReadAt: r.progress.lastReadAt,
            updatedAt: r.progress.updatedAt,
          }
          : null,
      }));
    }),

  // Récupérer un livre par ID
  getBook: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [book] = await db
        .select()
        .from(document)
        .where(eq(document.id, input.id))
        .limit(1);

      if (!book) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Book not found",
        });
      }

      // Vérifier les permissions
      const isOwner = book.ownerId === ctx.session.user.id;
      const isPublicBook = book.isPublic === "true";
      let isTeacher = false;

      // Les livres publics sont accessibles à tous les utilisateurs connectés
      if (!isOwner && !isPublicBook) {
        if (book.groupId) {
          // Vérifier l'appartenance au groupe
          const [membership] = await db
            .select()
            .from(groupMember)
            .where(
              and(
                eq(groupMember.groupId, book.groupId),
                eq(groupMember.userId, ctx.session.user.id)
              )
            )
            .limit(1);

          if (!membership) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You don't have access to this book",
            });
          }
        } else {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You don't have access to this book",
          });
        }
      }

      // Vérifier si l'utilisateur est le professeur du groupe
      if (book.groupId) {
        const [groupInfo] = await db
          .select({ teacherId: group.teacherId })
          .from(group)
          .where(eq(group.id, book.groupId))
          .limit(1);

        if (groupInfo) {
          isTeacher = groupInfo.teacherId === ctx.session.user.id;
        }
      }

      return { ...book, isTeacher };
    }),

  // Supprimer un livre (propriétaire uniquement, pas les livres publics)
  deleteBook: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [book] = await db
        .select()
        .from(document)
        .where(eq(document.id, input.id))
        .limit(1);

      if (!book) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Book not found",
        });
      }

      if (book.ownerId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the owner can delete this book",
        });
      }

      // Empêcher la suppression des livres de la bibliothèque publique
      if (book.isPublic === "true") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Les livres de la bibliothèque publique ne peuvent pas être supprimés ici. Utilisez la gestion de la bibliothèque publique.",
        });
      }

      // Supprimer le fichier physique du disque
      const fileSize = parseInt(book.filesize || "0", 10);
      try {
        await unlink(path.join(process.cwd(), book.filepath));
      } catch {
        // Silently ignore file deletion errors - DB record will still be removed
      }

      await db.delete(document).where(eq(document.id, input.id));

      // Décrémenter le stockage utilisé
      if (fileSize > 0) {
        await db.update(user)
          .set({ storageUsed: sql`GREATEST(0, ${user.storageUsed} - ${fileSize})` })
          .where(eq(user.id, ctx.session.user.id));
      }

      return { success: true };
    }),

  // Supprimer un livre d'un groupe (enseignant du groupe uniquement)
  removeBookFromGroup: protectedProcedure
    .input(z.object({ bookId: z.string(), groupId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Note: We now rely on group membership role (OWNER/ADMIN) instead of global role.
      // This allows Students who own Clubs to manage them.

      // Vérifier que le groupe existe et appartient à l'enseignant
      const [foundGroup] = await db
        .select()
        .from(group)
        .where(eq(group.id, input.groupId))
        .limit(1);

      if (!foundGroup) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Group not found",
        });
      }

      // Vérifier les permissions via groupMemeber (nouveau système RBAC)
      const [membership] = await db
        .select()
        .from(groupMember)
        .where(
          and(
            eq(groupMember.groupId, input.groupId),
            eq(groupMember.userId, ctx.session.user.id)
          )
        )
        .limit(1);

      if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only group admins can remove books",
        });
      }

      // Vérifier que le livre existe et appartient au groupe
      const [book] = await db
        .select()
        .from(document)
        .where(
          and(
            eq(document.id, input.bookId),
            eq(document.groupId, input.groupId)
          )
        )
        .limit(1);

      if (!book) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Book not found in this group",
        });
      }

      // Supprimer le fichier physique du disque
      try {
        await unlink(path.join(process.cwd(), book.filepath));
      } catch {
        // Silently ignore file deletion errors - DB record will still be removed
      }

      // Supprimer le livre de la base de données
      await db.delete(document).where(eq(document.id, input.bookId));

      return { success: true };
    }),

  // Copier un livre personnel vers un groupe (sans re-upload)
  copyToGroup: protectedProcedure
    .input(z.object({
      bookId: z.string(),
      groupId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Logic update: In CLUBs everyone can add books, in CLASS only admins.
      // This check is now performed later after fetching the group type.

      // Vérifier que le livre existe et appartient à l'utilisateur
      const [book] = await db
        .select()
        .from(document)
        .where(eq(document.id, input.bookId))
        .limit(1);

      if (!book) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Book not found",
        });
      }

      if (book.ownerId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only copy your own books",
        });
      }

      // Récupérer le groupe et vérifier les droits
      const [foundGroup] = await db
        .select()
        .from(group)
        .where(eq(group.id, input.groupId))
        .limit(1);

      if (!foundGroup) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Group not found",
        });
      }

      // Vérifier les permissions via groupMember
      const [membership] = await db
        .select()
        .from(groupMember)
        .where(
          and(
            eq(groupMember.groupId, input.groupId),
            eq(groupMember.userId, ctx.session.user.id)
          )
        )
        .limit(1);

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this group",
        });
      }

      // Logique de permission : seul le propriétaire ou l'admin peut ajouter des livres
      // (Valable pour CLASS et CLUB maintenant)
      if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only group admins can add books",
        });
      }

      // Créer une copie du livre dans le groupe (même fichier, nouvelle entrée)
      const id = crypto.randomUUID();
      const [newBook] = await db
        .insert(document)
        .values({
          id,
          title: book.title,
          author: book.author,
          filename: book.filename,
          filepath: book.filepath, // Même fichier physique
          filesize: book.filesize,
          mimeType: book.mimeType,
          ownerId: ctx.session.user.id,
          groupId: input.groupId,
        })
        .returning();

      return { success: true, book: newBook };
    }),

  // Récupérer tous les livres accessibles (personnels + groupes) avec progression
  getAccessibleBooksWithProgress: protectedProcedure.query(async ({ ctx }) => {
    // 1. Récupérer les groupes de l'utilisateur
    const userGroups = await db
      .select({ groupId: groupMember.groupId })
      .from(groupMember)
      .where(eq(groupMember.userId, ctx.session.user.id));

    const groupIds = userGroups.map((g) => g.groupId);

    // 2. Récupérer tous les livres (personnels + groupes) avec progression
    const rows = await db
      .select({
        book: document,
        progress: readingProgress,
        groupName: group.name,
        groupType: group.type,
      })
      .from(document)
      .leftJoin(
        readingProgress,
        and(
          eq(readingProgress.documentId, document.id),
          eq(readingProgress.userId, ctx.session.user.id)
        )
      )
      .leftJoin(group, eq(document.groupId, group.id))
      .where(
        or(
          // Livres personnels (exclure les livres publics)
          and(
            eq(document.ownerId, ctx.session.user.id),
            isNull(document.groupId),
            eq(document.isPublic, "false")
          ),
          // Livres des groupes dont l'utilisateur est membre
          ...(groupIds.length > 0 ? groupIds.map((gid) => eq(document.groupId, gid)) : [])
        )
      )
      // Trier par dernière lecture (les plus récemment lus en premier)
      // Les livres jamais lus (null) sont placés à la fin, triés par date de création
      .orderBy(
        sql`${readingProgress.lastReadAt} DESC NULLS LAST`,
        desc(document.createdAt)
      );

    // Retourner tous les livres sans déduplication
    // Chaque instance (personnel, groupe, club) doit être visible séparément
    return rows.map((r) => ({
      ...r.book,
      groupName: r.groupName,
      groupType: r.groupType,
      progress: r.progress
        ? {
          id: r.progress.id,
          currentLocation: r.progress.currentLocation,
          progressPercentage: r.progress.progressPercentage,
          lastReadAt: r.progress.lastReadAt,
          updatedAt: r.progress.updatedAt,
        }
        : null,
    }));
  }),

  // Récupérer la bibliothèque publique
  getPublicLibrary: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      limit: z.number().optional().default(50),
      offset: z.number().optional().default(0),
    }))
    .query(async ({ input }) => {
      const conditions = [eq(document.isPublic, "true")];

      if (input.search) {
        conditions.push(
          or(
            ilike(document.title, `%${input.search}%`),
            ilike(document.author, `%${input.search}%`)
          ) as any
        );
      }

      // Récupérer le nombre total de livres publics (avec les mêmes filtres)
      const [countResult] = await db
        .select({ count: count() })
        .from(document)
        .where(and(...conditions));

      const books = await db
        .select()
        .from(document)
        .where(and(...conditions))
        .orderBy(desc(document.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return { books, totalCount: countResult?.count ?? 0 };
    }),

  // Ajouter un livre de la bibliothèque publique à un groupe
  addPublicBookToGroup: protectedProcedure
    .input(z.object({
      publicBookId: z.string(),
      groupId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Vérifier que le livre existe et est public
      const [book] = await db
        .select()
        .from(document)
        .where(and(eq(document.id, input.publicBookId), eq(document.isPublic, "true")))
        .limit(1);

      if (!book) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Public book not found",
        });
      }

      // Récupérer le groupe
      const [foundGroup] = await db
        .select()
        .from(group)
        .where(eq(group.id, input.groupId))
        .limit(1);

      if (!foundGroup) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Group not found",
        });
      }

      // Vérifier les permissions via groupMember
      const [membership] = await db
        .select()
        .from(groupMember)
        .where(
          and(
            eq(groupMember.groupId, input.groupId),
            eq(groupMember.userId, ctx.session.user.id)
          )
        )
        .limit(1);

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this group",
        });
      }

      // Seuls OWNER ou ADMIN du groupe peuvent ajouter des livres
      if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only group admins can add books",
        });
      }

      // Créer une copie du livre dans le groupe (même fichier, nouvelle entrée)
      const id = crypto.randomUUID();
      const [newBook] = await db
        .insert(document)
        .values({
          id,
          title: book.title,
          author: book.author,
          filename: book.filename,
          filepath: book.filepath, // Même fichier physique
          filesize: book.filesize,
          mimeType: book.mimeType,
          ownerId: ctx.session.user.id,
          groupId: input.groupId,
          isPublic: "false", // La copie n'est pas publique
        })
        .returning();

      return { success: true, book: newBook };
    }),

  // Marquer un livre comme public (teacher/admin)
  markAsPublic: teacherProcedure
    .input(z.object({
      documentId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const [book] = await db
        .select()
        .from(document)
        .where(eq(document.id, input.documentId))
        .limit(1);

      if (!book) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Document not found",
        });
      }

      // Vérifier que l'utilisateur est le propriétaire du livre ou admin
      if (book.ownerId !== ctx.session.user.id && ctx.session.user.role !== "ADMIN") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Vous ne pouvez rendre public que vos propres livres",
        });
      }

      await db
        .update(document)
        .set({ isPublic: "true" })
        .where(eq(document.id, input.documentId));

      return { success: true };
    }),

  // Retirer un livre de la bibliothèque publique (admin uniquement)
  markAsPrivate: adminProcedure
    .input(z.object({
      documentId: z.string(),
    }))
    .mutation(async ({ input }) => {
      await db
        .update(document)
        .set({ isPublic: "false" })
        .where(eq(document.id, input.documentId));

      return { success: true };
    }),

  // "Réclamer" un livre public - crée une copie personnelle pour l'utilisateur
  claimPublicBook: protectedProcedure
    .input(z.object({
      publicBookId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Vérifier que le livre existe et est public
      const [book] = await db
        .select()
        .from(document)
        .where(and(eq(document.id, input.publicBookId), eq(document.isPublic, "true")))
        .limit(1);

      if (!book) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Public book not found",
        });
      }

      // Vérifier si l'utilisateur a déjà une copie personnelle de ce livre (même filepath)
      const [existingCopy] = await db
        .select()
        .from(document)
        .where(
          and(
            eq(document.filepath, book.filepath),
            eq(document.ownerId, ctx.session.user.id),
            isNull(document.groupId),
            eq(document.isPublic, "false")
          )
        )
        .limit(1);

      if (existingCopy) {
        // Retourner la copie existante
        return { success: true, book: existingCopy, alreadyExists: true };
      }

      // Créer une copie personnelle du livre
      const id = crypto.randomUUID();
      const [newBook] = await db
        .insert(document)
        .values({
          id,
          title: book.title,
          author: book.author,
          filename: book.filename,
          filepath: book.filepath, // Même fichier physique
          filesize: book.filesize,
          mimeType: book.mimeType,
          ownerId: ctx.session.user.id,
          groupId: null, // Copie personnelle
          isPublic: "false",
          claimedFromPublic: "true", // Marquer comme réclamé de la bibliothèque publique
        })
        .returning();

      return { success: true, book: newBook, alreadyExists: false };
    }),
});

