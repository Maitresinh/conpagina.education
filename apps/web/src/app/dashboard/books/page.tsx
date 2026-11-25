"use client";

import { DOCUMENT_ACCEPT, isReadingDocument } from "@/lib/document-upload";

import Link from "next/link";
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, FileText, Upload, Trash2, MoreVertical, Library, Users, Globe, User, GraduationCap } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full rounded-full bg-muted">
      <div className="h-2 rounded-full bg-primary" style={{ width: `${v}%` }} />
    </div>
  );
}

export default function DashboardBooksPage() {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Get user role
  const { data: userData } = useQuery(trpc.user.me.queryOptions());
  const userRole = userData?.role || "STUDENT";
  const canUpload = userRole === "TEACHER" || userRole === "ADMIN";

  const { data: books, isLoading, refetch } = useQuery(trpc.documents.getAccessibleBooksWithProgress.queryOptions());

  // Mutation pour uploader un livre
  const uploadBook = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/upload/document`, {
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
      toast.success("Livre ajouté avec succès !");
      setIsUploading(false);
      await queryClient.invalidateQueries({ queryKey: ["documents", "getAccessibleBooksWithProgress"] });
      await refetch();
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erreur lors de l'upload");
      setIsUploading(false);
    },
  });

  // Mutation pour supprimer un livre
  const deleteBook = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/trpc/documents.deleteBook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id }),
      });

      if (!response.ok) throw new Error("Failed to delete");
      return response.json();
    },
    onSuccess: async () => {
      toast.success("Livre supprimé");
      await queryClient.invalidateQueries({ queryKey: ["documents", "getAccessibleBooksWithProgress"] });
      await refetch();
    },
    onError: () => {
      toast.error("Erreur lors de la suppression");
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!isReadingDocument(file)) {
        toast.error("Seuls les fichiers EPUB et PDF sont acceptés");
        return;
      }
      setIsUploading(true);
      uploadBook.mutate(file);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Library className="h-5 w-5" />
          Mes lectures
        </h1>
        <div className="flex items-center gap-2">
          {canUpload && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={DOCUMENT_ACCEPT}
                onChange={handleFileSelect}
                className="hidden"
                id="book-upload-dashboard"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                size="sm"
                className="gap-2"
              >
                {isUploading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Upload...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Importer
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {canUpload
          ? "Tous vos livres : importés, partagés dans vos classes et clubs."
          : "Tous les livres accessibles depuis vos classes et clubs."}
      </p>

      {books && books.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {canUpload ? (
              <>Aucun livre pour le moment. Importez-en un pour commencer.</>
            ) : (
              <>
                Aucun livre accessible pour le moment.
                <br />
                Rejoignez une classe ou un club pour accéder aux livres partagés.
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
          {books?.map((book: any) => {
            const progress = book.progress?.progressPercentage ?? 0;
            const isGroupBook = !!book.groupId;
            const isPersonalBook = !book.groupId && book.ownerId === userData?.id;
            return (
              <Card key={book.id} className="group hover:shadow-lg transition-all duration-200 overflow-hidden flex flex-col !py-0 !gap-0">
                {/* Cover du livre - Avec coins arrondis en haut */}
                <Link href={`/read/${book.id}`} className="aspect-[2/3] w-full bg-muted relative overflow-hidden rounded-t-xl block">
                  <img
                    src={`${process.env.NEXT_PUBLIC_SERVER_URL}/api/cover/${book.id}`}
                    alt={book.title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  {/* Fallback visual */}
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-muted to-muted/80 -z-10">
                    <BookOpen className="h-8 w-8 text-muted-foreground/20" />
                  </div>

                  {/* Overlay progression */}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  {/* Badge progression */}
                  {progress > 0 && (
                    <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[9px] font-medium px-1.5 py-0.5 rounded-full">
                      {progress}%
                    </div>
                  )}

                  {/* Source indicator badge */}
                  {isGroupBook && book.groupName ? (
                    // Livre d'un groupe (Classe ou Club)
                    <div className={`absolute top-1.5 right-1.5 text-white text-[8px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-0.5 max-w-[80%] truncate ${
                      book.groupType === "CLASS"
                        ? "bg-blue-500/90"
                        : "bg-purple-500/90"
                    }`}>
                      {book.groupType === "CLASS" ? (
                        <GraduationCap className="h-2.5 w-2.5 flex-shrink-0" />
                      ) : (
                        <BookOpen className="h-2.5 w-2.5 flex-shrink-0" />
                      )}
                      <span className="truncate">{book.groupName}</span>
                    </div>
                  ) : isPersonalBook && book.claimedFromPublic === "true" ? (
                    // Livre réclamé de la bibliothèque publique
                    <div className="absolute top-1.5 right-1.5 bg-green-500/90 text-white text-[8px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                      <Globe className="h-2.5 w-2.5 flex-shrink-0" />
                      <span>Bibliothèque</span>
                    </div>
                  ) : isPersonalBook ? (
                    // Livre personnel importé par l'utilisateur
                    <div className="absolute top-1.5 right-1.5 bg-gray-500/90 text-white text-[8px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                      <User className="h-2.5 w-2.5 flex-shrink-0" />
                      <span>Personnel</span>
                    </div>
                  ) : null}

                  {/* Dropdown menu (only for personal books) */}
                  {isPersonalBook && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        onClick={(e) => e.preventDefault()}
                        className="absolute top-1.5 right-1.5 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shadow-md bg-black/50 hover:bg-black/70 text-white rounded-md flex items-center justify-center"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={(e) => {
                            e.preventDefault();
                            if (confirm("Voulez-vous vraiment supprimer ce livre ?")) {
                              deleteBook.mutate(book.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </Link>

                <div className="p-2 space-y-1">
                  <Link
                    href={`/read/${book.id}`}
                    className="font-medium text-xs line-clamp-2 leading-snug block"
                  >
                    {book.title}
                  </Link>
                  {book.author && (
                    <p className="text-[10px] text-muted-foreground line-clamp-1">
                      {book.author}
                    </p>
                  )}

                  {/* Infos supplémentaires pour le dashboard */}
                  <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground pt-0.5">
                    <span className="flex items-center gap-0.5">
                      <FileText className="h-2.5 w-2.5" />
                      {book.filesize ? `${(parseInt(book.filesize) / 1024 / 1024).toFixed(1)} MB` : "—"}
                    </span>
                    <span>•</span>
                    <span>
                      {new Date(book.createdAt).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
