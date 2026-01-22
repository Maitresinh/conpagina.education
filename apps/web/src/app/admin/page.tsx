"use client";

import {
  Users,
  FolderKanban,
  FileText,
  GraduationCap,
  TrendingUp,
  Activity,
  HardDrive,
  Server
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { trpc } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";

interface ServerStats {
  storage: {
    diskUsed: number;
    diskUsedMB: number;
    totalFilesOnDisk: number;
  };
  database: {
    totalDocuments: number;
    reportedSizeMB: number;
  };
  integrity: {
    isHealthy: boolean;
    orphanFilesCount: number;
    missingFilesCount: number;
  };
}

interface UserStorage {
  id: string;
  name: string;
  email: string;
  role: string;
  documentCount: number;
  storageUsedMB: number;
  quotaMB: number;
  usagePercent: number;
}

async function fetchWithAuth(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  loading
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  description?: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <div className="text-2xl font-bold">{value}</div>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const { data: stats, isLoading } = useQuery(trpc.admin.getStats.queryOptions());
  const { data: recentLogs } = useQuery(trpc.admin.getActivityLogs.queryOptions({
    limit: 5,
    page: 1
  }));

  const { data: serverStats, isLoading: serverStatsLoading } = useQuery<ServerStats>({
    queryKey: ["admin-server-stats"],
    queryFn: () => fetchWithAuth(`${SERVER_URL}/api/admin/stats`),
    refetchInterval: 60000,
  });

  const { data: usersStorage, isLoading: usersStorageLoading } = useQuery<{ users: UserStorage[] }>({
    queryKey: ["admin-users-storage"],
    queryFn: () => fetchWithAuth(`${SERVER_URL}/api/admin/users-storage`),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Vue d'ensemble</h1>
        <p className="text-muted-foreground">
          Bienvenue dans l'interface d'administration de Conpagina
        </p>
      </div>

      {/* Stats principales */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Utilisateurs"
          value={stats?.totalUsers ?? 0}
          icon={Users}
          description={`+${stats?.recentSignups ?? 0} ces 7 derniers jours`}
          loading={isLoading}
        />
        <StatCard
          title="Groupes"
          value={stats?.totalGroups ?? 0}
          icon={FolderKanban}
          loading={isLoading}
        />
        <StatCard
          title="Documents"
          value={stats?.totalDocuments ?? 0}
          icon={FileText}
          loading={isLoading}
        />
        <Link href={"/admin/teacher-requests" as any}>
          <StatCard
            title="Demandes en attente"
            value={stats?.pendingTeacherRequests ?? 0}
            icon={GraduationCap}
            description="Demandes de compte enseignant"
            loading={isLoading}
          />
        </Link>
      </div>

      {/* Répartition par rôle et sessions actives */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Répartition des utilisateurs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Étudiants</span>
                  <Badge variant="secondary">{stats?.usersByRole?.STUDENT ?? 0}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Enseignants</span>
                  <Badge variant="secondary">{stats?.usersByRole?.TEACHER ?? 0}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Administrateurs</span>
                  <Badge variant="destructive">{stats?.usersByRole?.ADMIN ?? 0}</Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Sessions actives
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div className="flex flex-col items-center justify-center py-4">
                <div className="text-4xl font-bold text-green-600">
                  {stats?.activeSessions ?? 0}
                </div>
                <p className="text-sm text-muted-foreground">
                  utilisateurs connectes
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stockage */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Stockage EPUB
            </CardTitle>
          </CardHeader>
          <CardContent>
            {serverStatsLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Espace utilise</span>
                  <span className="text-2xl font-bold">{serverStats?.storage.diskUsedMB ?? 0} MB</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Fichiers sur disque</span>
                  <Badge variant="secondary">{serverStats?.storage.totalFilesOnDisk ?? 0}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Documents en base</span>
                  <Badge variant="secondary">{serverStats?.database.totalDocuments ?? 0}</Badge>
                </div>
                {serverStats && !serverStats.integrity.isHealthy && (
                  <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-950 rounded text-sm text-yellow-700 dark:text-yellow-300">
                    {serverStats.integrity.orphanFilesCount} orphelins, {serverStats.integrity.missingFilesCount} manquants
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Server className="h-5 w-5" />
              Stockage par utilisateur
            </CardTitle>
            <Link
              href={"/admin/monitoring" as any}
              className="text-sm text-primary hover:underline"
            >
              Details
            </Link>
          </CardHeader>
          <CardContent>
            {usersStorageLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <div className="space-y-3 max-h-48 overflow-auto">
                {usersStorage?.users.slice(0, 5).map((user) => (
                  <div key={user.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="truncate max-w-[150px]">{user.name}</span>
                      <span className="font-mono text-xs">{user.storageUsedMB} MB</span>
                    </div>
                    <Progress value={user.usagePercent} className="h-1.5" />
                  </div>
                ))}
                {(usersStorage?.users.length ?? 0) > 5 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{(usersStorage?.users.length ?? 0) - 5} autres utilisateurs
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activité récente */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Activité récente
          </CardTitle>
          <Link
            href={"/admin/activity-logs" as any}
            className="text-sm text-primary hover:underline"
          >
            Voir tout
          </Link>
        </CardHeader>
        <CardContent>
          {recentLogs?.logs?.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aucune activité récente
            </p>
          ) : (
            <div className="space-y-3">
              {recentLogs?.logs?.map((log: {
                id: string;
                type: string;
                description: string;
                createdAt: string;
                user?: { name: string } | null
              }) => (
                <div key={log.id} className="flex items-start gap-3 text-sm">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2" />
                  <div className="flex-1">
                    <p className="font-medium">{log.description}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{log.type}</span>
                      <span>•</span>
                      <span>
                        {new Date(log.createdAt).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {log.user && (
                        <>
                          <span>•</span>
                          <span>{log.user.name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
