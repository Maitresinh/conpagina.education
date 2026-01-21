"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Upload, BookOpen, Trash2, FileText, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";



// ... imports
import { BookCard } from "@/components/book-card";

export default function MyBooks() {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  // Get user role
  const { data: userData } = useQuery(trpc.user.me.queryOptions());
  const userRole = userData?.role || "STUDENT";
  const canUpload = userRole === "TEACHER" || userRole === "ADMIN";

  // Récupérer tous les livres accessibles
  const { data: books, isLoading, refetch } = useQuery(
    trpc.documents.getAccessibleBooksWithProgress.queryOptions()
  );

  // Fonction pour uploader un seul fichier
  const uploadSingleFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

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
  };

  // Mutation pour uploader plusieurs livres
  const uploadBooks = useMutation({
    mutationFn: async (files: File[]) => {
      const results: { success: string[]; failed: string[] } = { success: [], failed: [] };

      for (const file of files) {
        try {
          await uploadSingleFile(file);
          results.success.push(file.name);
        } catch (error) {
          results.failed.push(file.name);
        }
      }

      return results;
    },
    onSuccess: async (results) => {
      if (results.success.length > 0) {
        toast.success(`${results.success.length} livre${results.success.length > 1 ? 's' : ''} ajouté${results.success.length > 1 ? 's' : ''} avec succès !`);
      }
      if (results.failed.length > 0) {
        toast.error(`Échec pour ${results.failed.length} fichier${results.failed.length > 1 ? 's' : ''}: ${results.failed.join(', ')}`);
      }
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

  // Mutation pour rendre un livre public
  const makePublic = useMutation(
    trpc.documents.markAsPublic.mutationOptions({
      onSuccess: async () => {
        toast.success("Livre ajouté à la bibliothèque publique !");
        await queryClient.invalidateQueries({ queryKey: ["documents", "getAccessibleBooksWithProgress"] });
        await queryClient.invalidateQueries({ queryKey: ["documents", "getPublicLibrary"] });
        await refetch();
      },
      onError: (error) => {
        toast.error(error.message || "Erreur lors de la publication");
      },
    })
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const MAX_FILES = 10;
    const fileArray = Array.from(files).slice(0, MAX_FILES);

    if (files.length > MAX_FILES) {
      toast.warning(`Maximum ${MAX_FILES} fichiers à la fois. Seuls les ${MAX_FILES} premiers seront importés.`);
    }

    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    for (const file of fileArray) {
      if (file.type === "application/epub+zip" || file.name.endsWith(".epub")) {
        validFiles.push(file);
      } else {
        invalidFiles.push(file.name);
      }
    }

    if (invalidFiles.length > 0) {
      toast.error(`Fichiers non-EPUB ignorés: ${invalidFiles.join(', ')}`);
    }

    if (validFiles.length > 0) {
      setIsUploading(true);
      uploadBooks.mutate(validFiles);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 gap-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {books?.length || 0} livre{(books?.length || 0) > 1 ? "s" : ""}
        </p>
        {canUpload && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".epub,application/epub+zip"
              onChange={handleFileSelect}
              className="hidden"
              id="book-upload"
              multiple
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              size="sm"
              variant="outline"
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
          </div>
        )}
      </div>

      {books && books.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-muted p-3 mb-3">
              <FileText className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground mb-2">
              {canUpload ? "Aucun livre pour le moment" : "Aucun livre accessible"}
            </p>
            {canUpload ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Importer votre premier EPUB
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Rejoignez une classe ou un club pour accéder aux livres partagés.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-3 gap-3">
          {books?.map((book: any) => {
            const isPersonalBook = !book.groupId && book.ownerId === userData?.id;
            const canMakePublic = isPersonalBook && canUpload && book.isPublic !== "true";
            return (
              <BookCard
                key={book.id}
                book={book}
                currentUserId={userData?.id}
                showSourceBadge={true}
                onDelete={isPersonalBook ? () => deleteBook.mutate(book.id) : undefined}
                onMakePublic={canMakePublic ? () => makePublic.mutate({ documentId: book.id }) : undefined}
                onClick={() => router.push(`/read/${book.id}` as any)}
              />
            );
          })}
        </div>
      )
      }
    </div >
  );
}

