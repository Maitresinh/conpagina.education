"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/utils/trpc";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Bell,
  Check,
  CheckCircle,
  XCircle,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  // Vérifier si l'utilisateur est connecté via authClient
  const { data: session, isPending: isLoadingAuth } = authClient.useSession();
  const isLoggedIn = !!session?.user;

  // Récupérer les données privées seulement si connecté
  const { data: privateData } = useQuery({
    ...trpc.privateData.queryOptions(),
    enabled: isLoggedIn,
  });

  // Récupérer le nombre de notifications non lues (pour tous les utilisateurs connectés)
  const { data: unreadData } = useQuery({
    ...trpc.notifications.getUnreadCount.queryOptions(),
    enabled: isLoggedIn,
  });

  // Récupérer les notifications (pour tous les utilisateurs connectés et panel ouvert)
  const { data: notifications, isLoading } = useQuery({
    ...trpc.notifications.getMyNotifications.queryOptions({ limit: 10 }),
    enabled: isLoggedIn && isOpen,
  });

  // Mutation pour marquer comme lu
  const markAsRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await fetch(`${serverUrl}/trpc/notifications.markAsRead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notificationId }),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Mutation pour marquer tout comme lu
  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${serverUrl}/trpc/notifications.markAllAsRead`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Toutes les notifications marquées comme lues");
    },
  });

  // Mutation pour répondre à une demande d'accès
  const respondToRequest = useMutation({
    mutationFn: async ({ requestId, approved }: { requestId: string; approved: boolean }) => {
      const response = await fetch(`${serverUrl}/trpc/notifications.respondToAccessRequest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ requestId, approved }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || "Erreur");
      }
      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(variables.approved ? "Demande acceptée" : "Demande refusée");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Mutation pour supprimer une notification
  const deleteNotification = useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await fetch(`${serverUrl}/trpc/notifications.deleteNotification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notificationId }),
      });
      return response.json();
    },
    onMutate: async (notificationId) => {
      // Mise à jour optimiste : ajouter l'ID aux notifications supprimées
      setDeletedIds(prev => new Set(prev).add(notificationId));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Ne pas afficher si pas connecté ou en cours de chargement
  if (isLoadingAuth || !isLoggedIn) {
    return null;
  }

  const unreadCount = unreadData?.count || 0;
  // Filtrer les notifications supprimées localement
  const notificationsList = (notifications || []).filter((n: any) => !deletedIds.has(n.id));

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="icon"
        className="relative"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Bell className="h-[1.2rem] w-[1.2rem]" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-[10px] font-medium text-white flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <>
          {/* Overlay pour fermer */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setIsOpen(false);
              setDeletedIds(new Set()); // Nettoyer les IDs supprimés à la fermeture
            }}
          />

          {/* Panel de notifications */}
          <Card className="fixed sm:absolute right-2 sm:right-0 left-2 sm:left-auto top-14 sm:top-full sm:mt-2 w-auto sm:w-96 max-h-[70vh] sm:max-h-[500px] overflow-hidden z-50 shadow-lg">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-semibold">Notifications</h3>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markAllAsRead.mutate()}
                  disabled={markAllAsRead.isPending}
                >
                  <Check className="h-4 w-4 mr-1" />
                  Tout marquer lu
                </Button>
              )}
            </div>

            <div className="overflow-y-auto max-h-[400px]">
              {/* Notifications avec demandes d'accès */}
              {isLoading ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </div>
              ) : notificationsList.filter((n: { type: string; resourceId: string | null }) =>
                // Filtrer les notifications access_request déjà traitées (sans resourceId)
                !(n.type === "access_request" && !n.resourceId)
              ).length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Aucune notification</p>
                </div>
              ) : (
                notificationsList
                  .filter((n: { type: string; resourceId: string | null }) =>
                    // Filtrer les notifications access_request déjà traitées (sans resourceId)
                    !(n.type === "access_request" && !n.resourceId)
                  )
                  .map((notif: {
                    id: string;
                    type: string;
                    title: string;
                    message: string;
                    isRead: string;
                    createdAt: string;
                    resourceId: string | null;
                    actionUrl: string | null;
                  }) => (
                    <div
                      key={notif.id}
                      className={`p-4 border-b last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-900 ${notif.isRead === "false" ? "bg-blue-50/50 dark:bg-blue-950/20" : ""
                        }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`shrink-0 h-2 w-2 mt-2 rounded-full ${notif.isRead === "false" ? "bg-blue-500" : "bg-transparent"
                          }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium">{notif.title}</p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNotification.mutate(notif.id);
                              }}
                              className="shrink-0 p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                              title="Supprimer"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="text-sm text-muted-foreground">{notif.message}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {(() => {
                              let date = new Date(notif.createdAt);
                              const now = new Date();
                              // Si la date semble dans le futur (problème de timezone UTC vs locale)
                              // On soustrait le décalage horaire local
                              if (date > now) {
                                const offsetMs = now.getTimezoneOffset() * 60 * 1000;
                                date = new Date(date.getTime() + offsetMs);
                              }
                              return formatDistanceToNow(date, { addSuffix: true, locale: fr });
                            })()}
                          </p>

                          {/* Boutons d'action pour les demandes d'accès */}
                          {notif.type === "access_request" && notif.resourceId && (
                            <div className="flex gap-2 mt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-green-600 border-green-600 hover:bg-green-50"
                                onClick={() => respondToRequest.mutate({ requestId: notif.resourceId!, approved: true })}
                                disabled={respondToRequest.isPending}
                              >
                                {respondToRequest.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle className="h-4 w-4 mr-1" />
                                    Accepter
                                  </>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600 border-red-600 hover:bg-red-50"
                                onClick={() => respondToRequest.mutate({ requestId: notif.resourceId!, approved: false })}
                                disabled={respondToRequest.isPending}
                              >
                                {respondToRequest.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <XCircle className="h-4 w-4 mr-1" />
                                    Refuser
                                  </>
                                )}
                              </Button>
                            </div>
                          )}

                          {/* Marquer comme lu si non lu */}
                          {notif.isRead === "false" && notif.type !== "access_request" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="mt-2 text-xs"
                              onClick={() => markAsRead.mutate(notif.id)}
                            >
                              Marquer comme lu
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
