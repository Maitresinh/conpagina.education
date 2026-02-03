"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, Copy, FileText, Library, RefreshCw, Trash2, Upload, Users, Calendar, Clock, Archive, ArchiveRestore, Share2, FolderDown, Check, MessageSquare, Globe, Search } from "lucide-react";

import { trpc } from "@/utils/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StudentList } from "@/components/student-list";
import { ShareGroupButton } from "@/components/share-citation";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { BookCard } from "@/components/book-card";
import { copyToClipboard } from "@/lib/clipboard";

const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001";

function BookCover({ bookId, title }: { bookId: string; title: string }) {
    return (
        <div className="shrink-0 w-12 h-16 bg-muted rounded overflow-hidden flex items-center justify-center">
            <img
                src={`${serverUrl}/api/cover/${bookId}`}
                alt={`Couverture de ${title}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                }}
            />
            <FileText className="h-6 w-6 text-muted-foreground absolute" />
        </div>
    );
}

export function GroupDetail() {
    const params = useParams<{ groupId: string }>();
    const groupId = params.groupId;
    const router = useRouter();
    const pathname = usePathname();
    const queryClient = useQueryClient();

    const isClubContext = pathname?.includes("/clubs/");

    // Modal state for importing from library
    const [showImportDialog, setShowImportDialog] = useState(false);
    const [selectedBooks, setSelectedBooks] = useState<string[]>([]);
    const [publicLibrarySearch, setPublicLibrarySearch] = useState("");
    const [debouncedPublicSearch, setDebouncedPublicSearch] = useState("");

    const { data: group, isLoading: isLoadingGroup } = useQuery(
        trpc.groups.get.queryOptions({ id: groupId })
    );

    // Get user role
    const { data: userData } = useQuery(trpc.user.me.queryOptions());
    const globalUserRole = userData?.role || "STUDENT";
    const canUploadPersonal = globalUserRole === "TEACHER" || globalUserRole === "ADMIN";

    // Permissions logic based on Group Role (RBAC)
    // We can only check this AFTER group is fetched
    const groupUserRole = (group as any)?.userRole;
    const isGroupAdmin = groupUserRole === "OWNER" || groupUserRole === "ADMIN";
    const isOwner = groupUserRole === "OWNER";

    // For UI, we treat Group Admins/Owners as "Teachers" (managers)
    const canManage = isGroupAdmin;

    const { data: members } = useQuery(trpc.groups.getMembers.queryOptions({ groupId }));

    const { data: books, isLoading: isLoadingBooks, refetch: refetchBooks } = useQuery(
        trpc.documents.getGroupBooks.queryOptions({ groupId })
    );

    // Query for personal library books (for import dialog - teachers/admins only)
    const { data: myBooks, isLoading: isLoadingMyBooks } = useQuery(
        trpc.documents.getMyBooks.queryOptions()
    );

    // Query for public library books (for import dialog)
    const { data: publicBooks, isLoading: isLoadingPublicBooks } = useQuery(
        trpc.documents.getPublicLibrary.queryOptions({ search: debouncedPublicSearch || undefined })
    );

    const regenerateCode = useMutation({
        mutationFn: async (id: string) => {
            const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/trpc/groups.regenerateInviteCode`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ id }),
            });
            if (!response.ok) throw new Error("Erreur lors de la régénération");
            return response.json();
        },
        onSuccess: async () => {
            toast.success("Code d'invitation régénéré");
            await queryClient.invalidateQueries({ queryKey: [["groups", "get"]] });
        },
        onError: () => toast.error("Erreur lors de la régénération"),
    });

    const deleteGroup = useMutation({
        mutationFn: async (id: string) => {
            const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/trpc/groups.delete`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ id }),
            });
            if (!response.ok) throw new Error("Erreur lors de la suppression");
            return response.json();
        },
        onSuccess: async () => {
            toast.success("Supprimé");
            // Redirect based on type if possible, or generic groups list
            router.push("/dashboard/groups");
        },
        onError: () => toast.error("Erreur lors de la suppression"),
    });

    const uploadBookToGroup = useMutation({
        mutationFn: async ({ file, groupId: gid }: { file: File; groupId: string }) => {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("groupId", gid);

            const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/upload/epub`, {
                method: "POST",
                credentials: "include",
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || "Upload failed");
            }

            return response.json();
        },
        onSuccess: async () => {
            toast.success("Livre ajouté !");
            await queryClient.invalidateQueries({ queryKey: ["documents", "getGroupBooks"] });
            await refetchBooks();
        },
        onError: (error: Error) => toast.error(error.message || "Erreur lors de l'upload"),
    });

    const copyInviteCode = async (code: string) => {
        const success = await copyToClipboard(code);
        if (success) {
            toast.success("Code copié !");
        } else {
            toast.error("Impossible de copier le code");
        }
    };

    const removeBookFromGroup = useMutation({
        mutationFn: async ({ bookId, groupId: gid }: { bookId: string; groupId: string }) => {
            const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/trpc/documents.removeBookFromGroup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ bookId, groupId: gid }),
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || "Erreur lors de la suppression");
            }
            return response.json();
        },
        onSuccess: async () => {
            toast.success("Livre supprimé");
            await queryClient.invalidateQueries({ queryKey: ["documents", "getGroupBooks"] });
            await refetchBooks();
        },
        onError: (error: Error) => toast.error(error.message || "Erreur lors de la suppression"),
    });

    // Mutation for copying books from personal library to group
    const copyToGroup = useMutation({
        mutationFn: async ({ bookId, groupId: gid }: { bookId: string; groupId: string }) => {
            const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/trpc/documents.copyToGroup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ bookId, groupId: gid }),
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || "Erreur lors de la copie");
            }
            return response.json();
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["documents", "getGroupBooks"] });
            await refetchBooks();
        },
        onError: (error: Error) => toast.error(error.message || "Erreur lors de la copie"),
    });

    // Mutation for adding public books to group
    const addPublicBookToGroup = useMutation({
        mutationFn: async ({ publicBookId, groupId: gid }: { publicBookId: string; groupId: string }) => {
            const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/trpc/documents.addPublicBookToGroup`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ publicBookId, groupId: gid }),
            });
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || "Erreur lors de l'ajout");
            }
            return response.json();
        },
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["documents", "getGroupBooks"] });
            await refetchBooks();
        },
        onError: (error: Error) => toast.error(error.message || "Erreur lors de l'ajout"),
    });

    // Handle importing selected books from personal library
    const handleImportPersonalBooks = async () => {
        if (selectedBooks.length === 0) return;

        let successCount = 0;
        for (const bookId of selectedBooks) {
            try {
                await copyToGroup.mutateAsync({ bookId, groupId });
                successCount++;
            } catch (e) {
                // Individual error handled by mutation
            }
        }

        if (successCount > 0) {
            toast.success(`${successCount} livre${successCount > 1 ? 's' : ''} importé${successCount > 1 ? 's' : ''} !`);
        }

        setSelectedBooks([]);
        setShowImportDialog(false);
    };

    // Handle importing selected books from public library
    const handleImportPublicBooks = async () => {
        if (selectedBooks.length === 0) return;

        let successCount = 0;
        for (const bookId of selectedBooks) {
            try {
                await addPublicBookToGroup.mutateAsync({ publicBookId: bookId, groupId });
                successCount++;
            } catch (e) {
                // Individual error handled by mutation
            }
        }

        if (successCount > 0) {
            toast.success(`${successCount} livre${successCount > 1 ? 's' : ''} ajouté${successCount > 1 ? 's' : ''} !`);
        }

        setSelectedBooks([]);
        setShowImportDialog(false);
    };

    // Handle search change with debounce
    const handlePublicSearchChange = (value: string) => {
        setPublicLibrarySearch(value);
        const timeout = setTimeout(() => {
            setDebouncedPublicSearch(value);
        }, 300);
        return () => clearTimeout(timeout);
    };

    // Toggle book selection
    const toggleBookSelection = (bookId: string) => {
        setSelectedBooks(prev =>
            prev.includes(bookId)
                ? prev.filter(id => id !== bookId)
                : [...prev, bookId]
        );
    };

    // Mutation pour archiver
    const archiveGroup = useMutation({
        mutationFn: async (id: string) => {
            const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/trpc/groups.archive`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ id }),
            });
            if (!response.ok) throw new Error("Erreur lors de l'archivage");
            return response.json();
        },
        onSuccess: async () => {
            toast.success("Archivé");
            await queryClient.invalidateQueries({ queryKey: ["groups", "get"] });
        },
        onError: () => toast.error("Erreur lors de l'archivage"),
    });

    // Mutation pour désarchiver
    const unarchiveGroup = useMutation({
        mutationFn: async (id: string) => {
            const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/trpc/groups.unarchive`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ id }),
            });
            if (!response.ok) throw new Error("Erreur lors de la désarchivage");
            return response.json();
        },
        onSuccess: async () => {
            toast.success("Désarchivé");
            await queryClient.invalidateQueries({ queryKey: ["groups", "get"] });
        },
        onError: () => toast.error("Erreur lors de la désarchivage"),
    });

    if (isLoadingGroup) {
        return (
            <div className="space-y-3">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-28 w-full" />
            </div>
        );
    }

    if (!group) {
        return (
            <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    Groupe introuvable.
                </CardContent>
            </Card>
        );
    }

    // Variables pour l'échéance
    const isArchived = (group as any)?.isArchived || false;
    const hasDeadline = !!(group as any)?.deadline;
    const deadlineDate = hasDeadline ? new Date((group as any).deadline) : null;
    const isDeadlinePassed = deadlineDate && deadlineDate < new Date();
    const isReadOnly = isArchived || isDeadlinePassed;

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <Button variant="ghost" size="sm" onClick={() => router.push((isClubContext ? "/dashboard/clubs" : "/dashboard/groups") as any)} className="gap-2 px-0">
                        <ArrowLeft className="h-4 w-4" /> Retour
                    </Button>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            {isArchived ? (
                                <Archive className="h-5 w-5 text-muted-foreground" />
                            ) : (
                                <Library className="h-5 w-5" />
                            )}
                            {group.name}
                        </h1>
                        {isArchived && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-full">
                                <Archive className="h-3 w-3" />
                                Archivé
                            </span>
                        )}
                        {!isArchived && isDeadlinePassed && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded-full">
                                <Clock className="h-3 w-3" />
                                Expiré
                            </span>
                        )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
                        <Users className="h-3.5 w-3.5" />
                        {members?.length ?? 0} membre{(members?.length ?? 0) > 1 ? "s" : ""}
                    </div>
                    {/* Affichage de l'échéance */}
                    {hasDeadline && (
                        <div className={`flex items-center gap-1 mt-1 text-xs ${isDeadlinePassed
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-muted-foreground'
                            }`}>
                            <Calendar className="h-3 w-3" />
                            <span>
                                Échéance : {deadlineDate?.toLocaleString("fr-FR", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    hour12: false,
                                    timeZone: "Europe/Paris"
                                })}
                            </span>
                            {(group as any).autoArchive && !isArchived && (
                                <span className="text-muted-foreground ml-1">(auto)</span>
                            )}
                        </div>
                    )}
                </div>

                {canManage ? (
                    <div className="flex gap-2 flex-wrap justify-end">
                        {/* Bouton Archiver/Désarchiver */}
                        {isArchived ? (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => unarchiveGroup.mutate(group.id)}
                                disabled={unarchiveGroup.isPending}
                                className="gap-2"
                            >
                                <ArchiveRestore className="h-4 w-4" />
                                Désarchiver
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    if (confirm("Voulez-vous archiver ? Les élèves ne pourront plus commenter ni interagir.")) {
                                        archiveGroup.mutate(group.id);
                                    }
                                }}
                                disabled={archiveGroup.isPending}
                                className="gap-2"
                            >
                                <Archive className="h-4 w-4" />
                                Archiver
                            </Button>
                        )}
                        {/* Regenerate button removed here */}
                        {isOwner && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    if (confirm("Voulez-vous vraiment supprimer ?")) {
                                        deleteGroup.mutate(group.id);
                                    }
                                }}
                                disabled={deleteGroup.isPending}
                                className="gap-2 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
                            >
                                <Trash2 className="h-4 w-4" />
                                Supprimer
                            </Button>
                        )}
                    </div>
                ) : null}
            </div>

            {/* Message si groupe archivé ou expiré pour les étudiants */}
            {!canManage && isReadOnly && (
                <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20">
                    <CardContent className="py-3 text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                        <Archive className="h-4 w-4" />
                        {isArchived
                            ? "Archivé. Vous pouvez consulter les livres et annotations mais ne pouvez plus interagir."
                            : "L'échéance est passée. Vous pouvez consulter les livres et annotations mais ne pouvez plus interagir."
                        }
                    </CardContent>
                </Card>
            )}



            {canManage && (
                <input
                    type="file"
                    accept=".epub,application/epub+zip"
                    className="hidden"
                    id="group-book-upload"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.type !== "application/epub+zip" && !file.name.endsWith(".epub")) {
                            toast.error("Seuls les fichiers EPUB sont acceptés");
                            return;
                        }
                        uploadBookToGroup.mutate({ file, groupId });
                        e.currentTarget.value = "";
                    }}
                />
            )}

            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base">Livres {(group as any).type === "CLUB" ? "du club" : "de la classe"}</CardTitle>
                            <CardDescription>{books?.length ?? 0} livre{(books?.length ?? 0) > 1 ? "s" : ""}</CardDescription>
                        </div>
                        {canManage && !isArchived && (
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-2"
                                    onClick={() => setShowImportDialog(true)}
                                    disabled={copyToGroup.isPending || addPublicBookToGroup.isPending}
                                >
                                    <FolderDown className="h-4 w-4" />
                                    Ajouter un livre
                                </Button>
                                {canUploadPersonal && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="gap-2"
                                        onClick={() => document.getElementById("group-book-upload")?.click()}
                                        disabled={uploadBookToGroup.isPending}
                                    >
                                        <Upload className="h-4 w-4" />
                                        {uploadBookToGroup.isPending ? "Upload..." : "Uploader"}
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoadingBooks ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                            {[1, 2, 3, 4, 5].map((i) => (
                                <Skeleton key={i} className="aspect-[2/3] w-full rounded-xl" />
                            ))}
                        </div>
                    ) : books && books.length === 0 ? (
                        <div className="py-10 text-center text-sm text-muted-foreground flex flex-col items-center">
                            <BookOpen className="h-10 w-10 mb-3 opacity-20" />
                            <p>Aucun livre dans {(group as any).type === "CLUB" ? "ce club" : "cette classe"}.</p>
                            {canManage && <p className="mt-1">Importez-en depuis votre bibliothèque ou uploadez un EPUB.</p>}
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
                            {books?.map((book: any) => (
                                <BookCard
                                    key={book.id}
                                    book={book}
                                    canManage={canManage && !isArchived}
                                    onRemoveFromGroup={() => removeBookFromGroup.mutate({ bookId: book.id, groupId })}
                                    onClick={() => router.push(`/read/${book.id}`)}
                                />
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Hub d'annotations */}
            {(group as any)?.annotationHubEnabled && (
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle className="text-base flex items-center gap-2">
                                    <MessageSquare className="h-4 w-4" />
                                    Hub d'annotations
                                </CardTitle>
                                <CardDescription>Vue centralisée de toutes les annotations</CardDescription>
                            </div>
                            <Button asChild size="sm" variant="outline" className="gap-2">
                                <Link href={`/dashboard/groups/${groupId}/annotations` as any}>
                                    Voir les annotations
                                </Link>
                            </Button>
                        </div>
                    </CardHeader>
                </Card>
            )}

            {/* Liste des étudiants (professeur uniquement) */}
            {/* We could potentially allow ADMINs to see this too */}
            <div className={`grid grid-cols-1 ${canManage ? 'lg:grid-cols-3' : ''} gap-6`}>
                <div className={canManage ? 'lg:col-span-1' : ''}>
                    <Card className="h-full">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Code d&apos;invitation</CardTitle>
                            <CardDescription>À partager avec les élèves.</CardDescription>
                        </CardHeader>
                        <CardContent className="flex items-center justify-between gap-4">
                            <div
                                className="flex-1 min-w-0 flex items-center justify-center gap-2 text-xl xl:text-2xl font-mono font-bold tracking-widest bg-muted px-3 py-2 rounded-md text-center cursor-pointer hover:bg-muted-foreground/20 transition-colors"
                                onClick={() => copyInviteCode(group.inviteCode)}
                                title="Cliquer pour copier"
                            >
                                {group.inviteCode}
                                <Copy className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="flex flex-col gap-2 shrink-0">
                                {canManage && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => regenerateCode.mutate(group.id)}
                                        disabled={regenerateCode.isPending || isArchived}
                                        className="gap-2"
                                    >
                                        <RefreshCw className={`h-4 w-4 ${regenerateCode.isPending ? 'animate-spin' : ''}`} />
                                        Régénérer
                                    </Button>
                                )}
                                <ShareGroupButton groupId={group.id} groupName={group.name} groupType={group.type} variant="button" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {canManage && (
                    <div className="lg:col-span-2">
                        <StudentList groupId={groupId} />
                    </div>
                )}
            </div>

            {/* Dialog pour importer des livres */}
            <Dialog open={showImportDialog} onOpenChange={(open) => {
                setShowImportDialog(open);
                if (!open) {
                    setSelectedBooks([]);
                    setPublicLibrarySearch("");
                    setDebouncedPublicSearch("");
                }
            }}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FolderDown className="h-5 w-5" />
                            Ajouter des livres
                        </DialogTitle>
                        <DialogDescription>
                            Sélectionnez les livres à ajouter au groupe.
                        </DialogDescription>
                    </DialogHeader>

                    <Tabs defaultValue={canUploadPersonal ? "personal" : "public"} className="flex-1 flex flex-col min-h-0" onValueChange={() => setSelectedBooks([])}>
                        <TabsList className="grid w-full grid-cols-2">
                            {canUploadPersonal && (
                                <TabsTrigger value="personal" className="gap-2">
                                    <Library className="h-4 w-4" />
                                    Ma bibliothèque
                                </TabsTrigger>
                            )}
                            <TabsTrigger value="public" className={`gap-2 ${!canUploadPersonal ? 'col-span-2' : ''}`}>
                                <Globe className="h-4 w-4" />
                                Bibliothèque publique
                            </TabsTrigger>
                        </TabsList>

                        {canUploadPersonal && (
                            <TabsContent value="personal" className="flex-1 overflow-y-auto py-4 mt-0">
                                {isLoadingMyBooks ? (
                                    <div className="space-y-2">
                                        <Skeleton className="h-16 w-full" />
                                        <Skeleton className="h-16 w-full" />
                                    </div>
                                ) : myBooks && myBooks.length === 0 ? (
                                    <div className="py-8 text-center text-sm text-muted-foreground">
                                        <Library className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                        <p>Votre bibliothèque personnelle est vide.</p>
                                        <p className="mt-1">Uploadez d&apos;abord des livres dans votre bibliothèque.</p>
                                    </div>
                                ) : (
                                    <div className="grid gap-2">
                                        {myBooks?.map((book: any) => {
                                            const isSelected = selectedBooks.includes(book.id);
                                            return (
                                                <div
                                                    key={book.id}
                                                    onClick={() => toggleBookSelection(book.id)}
                                                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                                                        ${isSelected
                                                            ? 'border-primary bg-primary/5'
                                                            : 'border-border hover:border-muted-foreground/50'
                                                        }`}
                                                >
                                                    <div className={`flex-shrink-0 w-6 h-6 rounded border flex items-center justify-center transition-colors
                                                        ${isSelected
                                                            ? 'bg-primary border-primary text-primary-foreground'
                                                            : 'border-muted-foreground/30'
                                                        }`}
                                                    >
                                                        {isSelected && <Check className="h-4 w-4" />}
                                                    </div>
                                                    <BookCover bookId={book.id} title={book.title} />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="font-medium text-sm truncate">{book.title}</p>
                                                        {book.author && (
                                                            <p className="text-xs text-muted-foreground truncate">{book.author}</p>
                                                        )}
                                                        <p className="text-xs text-muted-foreground">
                                                            Ajouté le {new Date(book.createdAt).toLocaleDateString("fr-FR")}
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </TabsContent>
                        )}

                        <TabsContent value="public" className="flex-1 overflow-y-auto py-4 mt-0 space-y-3">
                            {/* Search input */}
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Rechercher un livre..."
                                    value={publicLibrarySearch}
                                    onChange={(e) => handlePublicSearchChange(e.target.value)}
                                    className="pl-9"
                                />
                            </div>

                            {isLoadingPublicBooks ? (
                                <div className="space-y-2">
                                    <Skeleton className="h-16 w-full" />
                                    <Skeleton className="h-16 w-full" />
                                </div>
                            ) : publicBooks && publicBooks.books.length === 0 ? (
                                <div className="py-8 text-center text-sm text-muted-foreground">
                                    <Globe className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                    {debouncedPublicSearch ? (
                                        <p>Aucun livre trouvé pour &quot;{debouncedPublicSearch}&quot;</p>
                                    ) : (
                                        <p>La bibliothèque publique est vide pour le moment.</p>
                                    )}
                                </div>
                            ) : (
                                <div className="grid gap-2">
                                    {publicBooks?.books?.map((book: any) => {
                                        const isSelected = selectedBooks.includes(book.id);
                                        return (
                                            <div
                                                key={book.id}
                                                onClick={() => toggleBookSelection(book.id)}
                                                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                                                    ${isSelected
                                                        ? 'border-primary bg-primary/5'
                                                        : 'border-border hover:border-muted-foreground/50'
                                                    }`}
                                            >
                                                <div className={`flex-shrink-0 w-6 h-6 rounded border flex items-center justify-center transition-colors
                                                    ${isSelected
                                                        ? 'bg-primary border-primary text-primary-foreground'
                                                        : 'border-muted-foreground/30'
                                                    }`}
                                                >
                                                    {isSelected && <Check className="h-4 w-4" />}
                                                </div>
                                                <BookCover bookId={book.id} title={book.title} />
                                                <div className="min-w-0 flex-1">
                                                    <p className="font-medium text-sm truncate">{book.title}</p>
                                                    {book.author && (
                                                        <p className="text-xs text-muted-foreground truncate">{book.author}</p>
                                                    )}
                                                    <div className="flex items-center gap-1 text-xs text-blue-600">
                                                        <Globe className="h-3 w-3" />
                                                        Bibliothèque publique
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </TabsContent>
                    </Tabs>

                    <div className="flex items-center justify-between border-t pt-4">
                        <p className="text-sm text-muted-foreground">
                            {selectedBooks.length} livre{selectedBooks.length > 1 ? 's' : ''} sélectionné{selectedBooks.length > 1 ? 's' : ''}
                        </p>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setSelectedBooks([]);
                                    setShowImportDialog(false);
                                }}
                            >
                                Annuler
                            </Button>
                            <Button
                                onClick={() => {
                                    // Determine which import function to use based on the current tab
                                    // Check if any selected book is from public library
                                    const isPublicImport = publicBooks?.books?.some((b: any) => selectedBooks.includes(b.id));
                                    if (isPublicImport) {
                                        handleImportPublicBooks();
                                    } else {
                                        handleImportPersonalBooks();
                                    }
                                }}
                                disabled={selectedBooks.length === 0 || copyToGroup.isPending || addPublicBookToGroup.isPending}
                                className="gap-2"
                            >
                                {(copyToGroup.isPending || addPublicBookToGroup.isPending) ? (
                                    <>
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                        Import...
                                    </>
                                ) : (
                                    <>
                                        <FolderDown className="h-4 w-4" />
                                        Ajouter ({selectedBooks.length})
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
