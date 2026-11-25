import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  db,
  group,
  groupMember,
  user,
  groupAccessRequest,
  notification,
  commentAlertPreference,
  commentAlertDelivery,
  eq,
  and,
  desc
} from "@lectio/db";
import { protectedProcedure, router } from "../index";
import { defaultAlertPreferences } from "../lib/alert-content";

export const notificationsRouter = router({
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const [saved] = await db.select().from(commentAlertPreference).where(eq(commentAlertPreference.userId, ctx.session.user.id));
    const [latest] = await db.select({ status: commentAlertDelivery.status, sentAt: commentAlertDelivery.sentAt, lastError: commentAlertDelivery.lastError })
      .from(commentAlertDelivery).where(eq(commentAlertDelivery.userId, ctx.session.user.id))
      .orderBy(desc(commentAlertDelivery.createdAt)).limit(1);
    return { preferences: saved || defaultAlertPreferences,
      email: ctx.session.user.email, serviceEnabled: process.env.COMMENT_ALERTS_ENABLED === "true" && !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM,
      latestDelivery: latest || null };
  }),
  updatePreferences: protectedProcedure.input(z.object({
    emailFrequency: z.enum(["off", "immediate", "daily"]),
    newComments: z.boolean(), replies: z.boolean(), groupIds: z.array(z.string()).max(200),
  })).mutation(async ({ ctx, input }) => {
    const memberships = await db.select({ id: groupMember.groupId }).from(groupMember).where(eq(groupMember.userId, ctx.session.user.id));
    const allowed = new Set(memberships.map(m => m.id));
    if (input.groupIds.some(id => !allowed.has(id))) throw new TRPCError({ code: "FORBIDDEN", message: "Classe inaccessible" });
    const values = { ...input, groupIds: [...new Set(input.groupIds)], updatedAt: new Date() };
    await db.insert(commentAlertPreference).values({ userId: ctx.session.user.id, ...values })
      .onConflictDoUpdate({ target: commentAlertPreference.userId, set: values });
    return { success: true };
  }),
  // Demander l'accès à un groupe
  requestGroupAccess: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        message: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Vérifier que le groupe existe
      const [grp] = await db
        .select()
        .from(group)
        .where(eq(group.id, input.groupId))
        .limit(1);

      if (!grp) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Groupe introuvable",
        });
      }

      // Vérifier que l'utilisateur n'est pas déjà membre
      const [existingMember] = await db
        .select()
        .from(groupMember)
        .where(
          and(
            eq(groupMember.groupId, input.groupId),
            eq(groupMember.userId, ctx.session.user.id)
          )
        )
        .limit(1);

      if (existingMember) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Vous êtes déjà membre de ce groupe",
        });
      }

      // Vérifier qu'il n'y a pas déjà une demande en attente
      const [existingRequest] = await db
        .select()
        .from(groupAccessRequest)
        .where(
          and(
            eq(groupAccessRequest.groupId, input.groupId),
            eq(groupAccessRequest.userId, ctx.session.user.id),
            eq(groupAccessRequest.status, "pending")
          )
        )
        .limit(1);

      if (existingRequest) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Vous avez déjà une demande en attente pour ce groupe",
        });
      }

      // Créer la demande d'accès
      const requestId = crypto.randomUUID();
      await db.insert(groupAccessRequest).values({
        id: requestId,
        userId: ctx.session.user.id,
        groupId: input.groupId,
        message: input.message || null,
        status: "pending",
      });

      // Récupérer le nom de l'utilisateur
      const [requester] = await db
        .select({ name: user.name })
        .from(user)
        .where(eq(user.id, ctx.session.user.id))
        .limit(1);

      // Récupérer tous les OWNER du groupe (pour les clubs, ce sont les créateurs)
      const owners = await db
        .select({ userId: groupMember.userId })
        .from(groupMember)
        .where(
          and(
            eq(groupMember.groupId, input.groupId),
            eq(groupMember.role, "OWNER")
          )
        );

      // Créer une notification pour chaque OWNER du groupe
      const actionUrl = grp.type === "CLUB"
        ? `/dashboard/clubs/${input.groupId}?tab=requests`
        : `/dashboard/groups/${input.groupId}?tab=requests`;

      for (const owner of owners) {
        await db.insert(notification).values({
          id: crypto.randomUUID(),
          userId: owner.userId,
          type: "access_request",
          title: "Nouvelle demande d'accès",
          message: `${requester?.name || "Un utilisateur"} souhaite rejoindre ${grp.type === "CLUB" ? "le club" : "la classe"} "${grp.name}"${input.message ? `: "${input.message}"` : ""}`,
          actionUrl,
          resourceId: requestId,
          isRead: "false",
        });
      }

      return { success: true, requestId };
    }),

  // Répondre à une demande d'accès (OWNER ou ADMIN du groupe)
  respondToAccessRequest: protectedProcedure
    .input(
      z.object({
        requestId: z.string(),
        approved: z.boolean(),
        responseMessage: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Récupérer la demande
      const [request] = await db
        .select()
        .from(groupAccessRequest)
        .where(eq(groupAccessRequest.id, input.requestId))
        .limit(1);

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Demande introuvable",
        });
      }

      // Vérifier que la demande n'a pas déjà été traitée
      if (request.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cette demande a déjà été traitée",
        });
      }

      // Récupérer le groupe
      const [grp] = await db
        .select()
        .from(group)
        .where(eq(group.id, request.groupId))
        .limit(1);

      if (!grp) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Groupe introuvable",
        });
      }

      // Vérifier que l'utilisateur est OWNER ou ADMIN du groupe
      const [membership] = await db
        .select()
        .from(groupMember)
        .where(
          and(
            eq(groupMember.groupId, request.groupId),
            eq(groupMember.userId, ctx.session.user.id)
          )
        )
        .limit(1);

      if (!membership || (membership.role !== "OWNER" && membership.role !== "ADMIN")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Seuls les administrateurs peuvent répondre aux demandes",
        });
      }

      // Mettre à jour la demande
      await db
        .update(groupAccessRequest)
        .set({
          status: input.approved ? "approved" : "rejected",
          responseMessage: input.responseMessage || null,
          respondedAt: new Date(),
        })
        .where(eq(groupAccessRequest.id, input.requestId));

      // Si approuvé, ajouter l'utilisateur au groupe (s'il n'est pas déjà membre)
      if (input.approved) {
        // Vérifier s'il est déjà membre
        const [existingMember] = await db
          .select()
          .from(groupMember)
          .where(
            and(
              eq(groupMember.groupId, request.groupId),
              eq(groupMember.userId, request.userId)
            )
          )
          .limit(1);

        if (!existingMember) {
          await db.insert(groupMember).values({
            groupId: request.groupId,
            userId: request.userId,
          });
        }
      }

      // Créer une notification pour l'utilisateur
      const actionUrl = grp.type === "CLUB"
        ? `/dashboard/clubs/${request.groupId}`
        : `/dashboard/groups/${request.groupId}`;

      await db.insert(notification).values({
        id: crypto.randomUUID(),
        userId: request.userId,
        type: input.approved ? "access_approved" : "access_rejected",
        title: input.approved ? "Demande acceptée !" : "Demande refusée",
        message: input.approved
          ? `Votre demande pour rejoindre "${grp.name}" a été acceptée !${input.responseMessage ? ` Message: "${input.responseMessage}"` : ""}`
          : `Votre demande pour rejoindre "${grp.name}" a été refusée.${input.responseMessage ? ` Raison: "${input.responseMessage}"` : ""}`,
        actionUrl: input.approved ? actionUrl : null,
        resourceId: request.groupId,
        isRead: "false",
      });

      // Marquer toutes les notifications de demande d'accès liées comme traitées
      await db
        .update(notification)
        .set({
          isRead: "true",
          resourceId: null, // Retire les boutons d'action
        })
        .where(
          and(
            eq(notification.resourceId, input.requestId),
            eq(notification.type, "access_request")
          )
        );

      return { success: true };
    }),

  // Récupérer les demandes d'accès en attente pour un groupe (OWNER ou ADMIN)
  getPendingRequests: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Vérifier que l'utilisateur est OWNER ou ADMIN du groupe
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
          message: "Seuls les administrateurs peuvent voir les demandes",
        });
      }

      // Récupérer les demandes avec les infos utilisateur
      const requests = await db
        .select({
          id: groupAccessRequest.id,
          message: groupAccessRequest.message,
          status: groupAccessRequest.status,
          createdAt: groupAccessRequest.createdAt,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
          },
        })
        .from(groupAccessRequest)
        .innerJoin(user, eq(groupAccessRequest.userId, user.id))
        .where(
          and(
            eq(groupAccessRequest.groupId, input.groupId),
            eq(groupAccessRequest.status, "pending")
          )
        )
        .orderBy(desc(groupAccessRequest.createdAt));

      return requests;
    }),

  // Récupérer les notifications de l'utilisateur connecté
  getMyNotifications: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        onlyUnread: z.boolean().default(false),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit || 20;
      const onlyUnread = input?.onlyUnread || false;

      let query = db
        .select()
        .from(notification)
        .where(
          onlyUnread
            ? and(
              eq(notification.userId, ctx.session.user.id),
              eq(notification.isRead, "false")
            )
            : eq(notification.userId, ctx.session.user.id)
        )
        .orderBy(desc(notification.createdAt))
        .limit(limit);

      return await query;
    }),

  // Compter les notifications non lues
  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const notifications = await db
      .select({ id: notification.id })
      .from(notification)
      .where(
        and(
          eq(notification.userId, ctx.session.user.id),
          eq(notification.isRead, "false")
        )
      );

    return { count: notifications.length };
  }),

  // Marquer une notification comme lue
  markAsRead: protectedProcedure
    .input(z.object({ notificationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(notification)
        .set({ isRead: "true" })
        .where(
          and(
            eq(notification.id, input.notificationId),
            eq(notification.userId, ctx.session.user.id)
          )
        );

      return { success: true };
    }),

  // Marquer toutes les notifications comme lues
  markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
    await db
      .update(notification)
      .set({ isRead: "true" })
      .where(eq(notification.userId, ctx.session.user.id));

    return { success: true };
  }),

  // Supprimer une notification
  deleteNotification: protectedProcedure
    .input(z.object({ notificationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(notification)
        .where(
          and(
            eq(notification.id, input.notificationId),
            eq(notification.userId, ctx.session.user.id)
          )
        );

      return { success: true };
    }),

  // Vérifier si l'utilisateur a déjà une demande en attente pour un groupe
  hasRequestPending: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [existingRequest] = await db
        .select()
        .from(groupAccessRequest)
        .where(
          and(
            eq(groupAccessRequest.groupId, input.groupId),
            eq(groupAccessRequest.userId, ctx.session.user.id),
            eq(groupAccessRequest.status, "pending")
          )
        )
        .limit(1);

      return { hasPending: !!existingRequest };
    }),

  // Vérifier si l'utilisateur est déjà membre d'un groupe
  isMemberOfGroup: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .query(async ({ ctx, input }) => {
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

      // Vérifier aussi si c'est le professeur
      const [grp] = await db
        .select()
        .from(group)
        .where(eq(group.id, input.groupId))
        .limit(1);

      const isTeacher = grp?.teacherId === ctx.session.user.id;

      return {
        isMember: !!membership || isTeacher,
        isTeacher
      };
    }),
});
