"use client";

import { useState } from "react";
import {
  Server,
  HardDrive,
  Database,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Clock,
  MemoryStick,
  FileWarning,
  CheckCircle2,
  XCircle,
  Users,
  Download,
  Upload,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";

interface ServerStats {
  timestamp: string;
  responseTime: number;
  uptime: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    external: number;
    heapUsedMB: number;
    rssMB: number;
  };
  storage: {
    diskUsed: number;
    diskUsedMB: number;
    totalFilesOnDisk: number;
    coversSize: number;
    siteAssetsSize: number;
  };
  database: {
    totalDocuments: number;
    totalUsers: number;
    totalGroups: number;
    reportedSize: number;
    reportedSizeMB: number;
  };
  integrity: {
    orphanFiles: Array<{ name: string; size: number }>;
    orphanFilesCount: number;
    orphanFilesSize: number;
    missingFiles: Array<{ id: string; filepath: string; title: string; ownerName: string; ownerEmail: string }>;
    missingFilesCount: number;
    isHealthy: boolean;
  };
  logs: {
    total: number;
    errors: number;
    warnings: number;
    lastError: {
      timestamp: string;
      message: string;
      context?: Record<string, unknown>;
    } | null;
  };
  metrics: {
    requests: { total: number; success: number; errors: number };
    uploads: { total: number; success: number; errors: number; bytes: number };
    downloads: { total: number; bytes: number };
    covers: { extracted: number; fetched: number; cached: number; placeholders: number };
    uptimeSeconds: number;
  };
  rateLimiter: {
    activeEntries: number;
  };
}

interface LogEntry {
  timestamp: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

interface UserStorage {
  id: string;
  name: string;
  email: string;
  role: string;
  storageUsed: number;
  storageQuota: number;
  documentCount: number;
  actualStorageUsed: number;
  storageUsedMB: number;
  quotaMB: number;
  usagePercent: number;
  createdAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}j ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

async function fetchWithAuth(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

interface LogFile {
  date: string;
  filename: string;
  size: number;
  lineCount: number;
  isToday: boolean;
}

export default function MonitoringPage() {
  const queryClient = useQueryClient();
  const [logLevel, setLogLevel] = useState<string>("all");
  const [logCount, setLogCount] = useState<number>(50);
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [cleanupMissingDialogOpen, setCleanupMissingDialogOpen] = useState(false);
  const [selectedLogDate, setSelectedLogDate] = useState<string>("today");

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<ServerStats>({
    queryKey: ["admin-stats"],
    queryFn: () => fetchWithAuth(`${SERVER_URL}/api/admin/stats`),
    refetchInterval: 30000,
  });

  const { data: logFiles } = useQuery<{ files: LogFile[] }>({
    queryKey: ["admin-log-files"],
    queryFn: () => fetchWithAuth(`${SERVER_URL}/api/admin/log-files`),
  });

  const { data: logsData, isLoading: logsLoading, refetch: refetchLogs } = useQuery<{ logs: LogEntry[]; total: number }>({
    queryKey: ["admin-logs", logLevel, logCount, selectedLogDate],
    queryFn: () => {
      if (selectedLogDate === "today") {
        return fetchWithAuth(
          `${SERVER_URL}/api/admin/logs?count=${logCount}${logLevel !== "all" ? `&level=${logLevel}` : ""}`
        );
      }
      return fetchWithAuth(
        `${SERVER_URL}/api/admin/logs/${selectedLogDate}?count=${logCount}${logLevel !== "all" ? `&level=${logLevel}` : ""}`
      );
    },
  });

  const { data: usersData, isLoading: usersLoading } = useQuery<{ users: UserStorage[] }>({
    queryKey: ["admin-users-storage"],
    queryFn: () => fetchWithAuth(`${SERVER_URL}/api/admin/users-storage`),
  });

  const cleanupMutation = useMutation({
    mutationFn: () => fetchWithAuth(`${SERVER_URL}/api/admin/cleanup-orphans`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });

  const cleanupMissingMutation = useMutation({
    mutationFn: () => fetchWithAuth(`${SERVER_URL}/api/admin/cleanup-missing`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
  });

  const handleRefresh = () => {
    refetchStats();
    refetchLogs();
    queryClient.invalidateQueries({ queryKey: ["admin-log-files"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Monitoring Systeme</h1>
          <p className="text-muted-foreground">
            Stats serveur, stockage, logs et integrite des donnees
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualiser
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="storage">Stockage</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          <TabsTrigger value="users">Utilisateurs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Stats principales */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Uptime</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <div className="text-2xl font-bold">
                    {formatDuration(stats?.uptime || 0)}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Memoire RAM</CardTitle>
                <MemoryStick className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{stats?.memory.heapUsedMB} MB</div>
                    <p className="text-xs text-muted-foreground">
                      RSS: {stats?.memory.rssMB} MB
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Stockage</CardTitle>
                <HardDrive className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{stats?.storage.diskUsedMB} MB</div>
                    <p className="text-xs text-muted-foreground">
                      {stats?.storage.totalFilesOnDisk} fichiers EPUB
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Integrite</CardTitle>
                {stats?.integrity.isHealthy ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                )}
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : stats?.integrity.isHealthy ? (
                  <div className="text-2xl font-bold text-green-600">OK</div>
                ) : (
                  <>
                    <div className="text-2xl font-bold text-yellow-600">Attention</div>
                    <p className="text-xs text-muted-foreground">
                      {stats?.integrity.orphanFilesCount} orphelins, {stats?.integrity.missingFilesCount} manquants
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Metriques */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Uploads
                </CardTitle>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Succes</span>
                      <Badge variant="secondary">{stats?.metrics.uploads.success}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Erreurs</span>
                      <Badge variant={stats?.metrics.uploads.errors ? "destructive" : "secondary"}>
                        {stats?.metrics.uploads.errors}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Volume</span>
                      <span className="text-sm font-medium">{formatBytes(stats?.metrics.uploads.bytes || 0)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Telechargements
                </CardTitle>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-20 w-full" />
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Total</span>
                      <Badge variant="secondary">{stats?.metrics.downloads.total}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Volume</span>
                      <span className="text-sm font-medium">{formatBytes(stats?.metrics.downloads.bytes || 0)}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Derniere erreur */}
          {stats?.logs.lastError && (
            <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-red-700 dark:text-red-400">
                  <XCircle className="h-5 w-5" />
                  Derniere erreur
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  {stats.logs.lastError.message}
                </p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  {new Date(stats.logs.lastError.timestamp).toLocaleString("fr-FR")}
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="storage" className="space-y-4">
          {/* Detail stockage */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Fichiers EPUB</CardTitle>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <>
                    <div className="text-3xl font-bold">{stats?.storage.totalFilesOnDisk}</div>
                    <p className="text-sm text-muted-foreground">
                      {stats?.database.totalDocuments} en base de donnees
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Covers en cache</CardTitle>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <>
                    <div className="text-3xl font-bold">{formatBytes(stats?.storage.coversSize || 0)}</div>
                    <p className="text-sm text-muted-foreground">
                      {stats?.metrics.covers.cached} depuis le cache
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Assets du site</CardTitle>
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : (
                  <div className="text-3xl font-bold">{formatBytes(stats?.storage.siteAssetsSize || 0)}</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Integrite */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileWarning className="h-5 w-5" />
                  Integrite des fichiers
                </CardTitle>
                <CardDescription>
                  Verification de coherence entre le disque et la base de donnees
                </CardDescription>
              </div>
              {stats && !stats.integrity.isHealthy && (
                <div className="flex gap-2">
                  {stats.integrity.orphanFilesCount > 0 && (
                    <Dialog open={cleanupDialogOpen} onOpenChange={setCleanupDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Nettoyer les orphelins
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Confirmer le nettoyage</DialogTitle>
                          <DialogDescription>
                            Cette action va supprimer {stats.integrity.orphanFilesCount} fichier(s) orphelin(s)
                            ({formatBytes(stats.integrity.orphanFilesSize)}) du disque.
                            Cette action est irreversible.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setCleanupDialogOpen(false)}>
                            Annuler
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => {
                              cleanupMutation.mutate();
                              setCleanupDialogOpen(false);
                            }}
                          >
                            Supprimer
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                  {stats.integrity.missingFilesCount > 0 && (
                    <Dialog open={cleanupMissingDialogOpen} onOpenChange={setCleanupMissingDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Nettoyer les manquants
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Confirmer le nettoyage</DialogTitle>
                          <DialogDescription>
                            Cette action va supprimer {stats.integrity.missingFilesCount} entree(s) de la base de donnees
                            dont les fichiers n'existent plus sur le disque.
                            Cette action est irreversible.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setCleanupMissingDialogOpen(false)}>
                            Annuler
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => {
                              cleanupMissingMutation.mutate();
                              setCleanupMissingDialogOpen(false);
                            }}
                          >
                            Supprimer
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : stats?.integrity.isHealthy ? (
                <div className="flex items-center gap-3 text-green-600">
                  <CheckCircle2 className="h-8 w-8" />
                  <div>
                    <p className="font-medium">Tous les fichiers sont synchronises</p>
                    <p className="text-sm text-muted-foreground">
                      Aucun fichier orphelin ou manquant detecte
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {stats!.integrity.orphanFilesCount > 0 && (
                    <div>
                      <h4 className="font-medium text-yellow-700 dark:text-yellow-400 mb-2">
                        Fichiers orphelins ({stats!.integrity.orphanFilesCount})
                      </h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        Fichiers sur le disque sans entree en base de donnees
                      </p>
                      <div className="text-xs font-mono bg-muted p-2 rounded max-h-32 overflow-auto">
                        {stats!.integrity.orphanFiles.map((f) => (
                          <div key={f.name}>
                            {f.name} ({formatBytes(f.size)})
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {stats!.integrity.missingFilesCount > 0 && (
                    <div>
                      <h4 className="font-medium text-red-700 dark:text-red-400 mb-2">
                        Fichiers manquants ({stats!.integrity.missingFilesCount})
                      </h4>
                      <p className="text-sm text-muted-foreground mb-2">
                        Entrees en base de donnees sans fichier sur le disque
                      </p>
                      <div className="text-xs bg-muted p-3 rounded max-h-48 overflow-auto space-y-2">
                        {stats!.integrity.missingFiles.map((f) => (
                          <div key={f.id} className="border-b border-border pb-2 last:border-b-0">
                            <div className="font-semibold text-foreground">{f.title}</div>
                            <div className="text-muted-foreground mt-1">
                              Uploadé par: {f.ownerName} ({f.ownerEmail})
                            </div>
                            <div className="text-muted-foreground text-[10px] font-mono mt-1">
                              {f.filepath}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Logs serveur</CardTitle>
                <CardDescription>
                  {selectedLogDate === "today"
                    ? `${logsData?.total} logs en memoire - Persistance activee`
                    : `Logs du ${selectedLogDate} (${logsData?.total} entrees)`}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={selectedLogDate} onValueChange={setSelectedLogDate}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Date" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Aujourd'hui</SelectItem>
                    {logFiles?.files.filter(f => !f.isToday).map((file) => (
                      <SelectItem key={file.date} value={file.date}>
                        {file.date} ({file.lineCount})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={logLevel} onValueChange={setLogLevel}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Niveau" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="error">Erreurs</SelectItem>
                    <SelectItem value="warn">Warnings</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="debug">Debug</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={logCount.toString()} onValueChange={(v) => setLogCount(parseInt(v))}>
                  <SelectTrigger className="w-24">
                    <SelectValue placeholder="Nombre" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="200">200</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {logsLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <div className="max-h-[500px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-40">Timestamp</TableHead>
                        <TableHead className="w-20">Niveau</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead className="w-48">Contexte</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logsData?.logs.map((log, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-mono">
                            {new Date(log.timestamp).toLocaleString("fr-FR")}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                log.level === "error"
                                  ? "destructive"
                                  : log.level === "warn"
                                    ? "default"
                                    : "secondary"
                              }
                            >
                              {log.level}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            {log.message}
                            {log.error && (
                              <p className="text-xs text-red-600 mt-1">
                                {log.error.name}: {log.error.message}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {log.context && JSON.stringify(log.context).substring(0, 50)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                Stockage par utilisateur
              </CardTitle>
              <CardDescription>
                Utilisation du quota de stockage par utilisateur
              </CardDescription>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (
                <div className="max-h-[500px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Utilisateur</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead className="text-right">Documents</TableHead>
                        <TableHead className="text-right">Stockage</TableHead>
                        <TableHead className="w-48">Quota</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usersData?.users.map((user) => (
                        <TableRow key={user.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{user.name}</p>
                              <p className="text-xs text-muted-foreground">{user.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                user.role === "ADMIN"
                                  ? "destructive"
                                  : user.role === "TEACHER"
                                    ? "default"
                                    : "secondary"
                              }
                            >
                              {user.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{user.documentCount}</TableCell>
                          <TableCell className="text-right font-mono">
                            {user.storageUsedMB} MB
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Progress value={user.usagePercent} className="h-2" />
                              <p className="text-xs text-muted-foreground text-right">
                                {user.usagePercent}% de {user.quotaMB} MB
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
