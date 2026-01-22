"use client";
// Unified BookCard Component v1.2

import { Card } from "@/components/ui/card";
import { BookOpen, MoreVertical, Trash2, GraduationCap, Globe, User, Share2 } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3001";

interface BookCardProps {
    book: {
        id: string;
        title: string;
        author?: string | null;
        createdAt: string | Date;
        progress?: {
            progressPercentage?: number;
        } | null;
        // Source info for badges
        groupId?: string | null;
        groupName?: string | null;
        groupType?: "CLASS" | "CLUB" | null;
        ownerId?: string | null;
        claimedFromPublic?: string | null;
    };
    currentUserId?: string; // To determine if book is personal
    onClick?: () => void;
    // Actions
    onDelete?: () => void; // For "My Books" (delete from library)
    onRemoveFromGroup?: () => void; // For "Group Books" (remove from group)
    onMakePublic?: () => void; // For "My Books" (make book public - teacher/admin only)
    canManage?: boolean; // For "Group Books" (permission check)
    isLoading?: boolean; // Show loading spinner overlay
    showSourceBadge?: boolean; // Show source indicator badge
}

export function BookCard({
    book,
    currentUserId,
    onClick,
    onDelete,
    onRemoveFromGroup,
    onMakePublic,
    canManage = true, // Default to true for My Books context where user owns the book
    isLoading = false,
    showSourceBadge = false,
}: BookCardProps) {
    // Determine if we should show the dropdown or just a delete button or nothing
    const showActions = !!onDelete || (!!onRemoveFromGroup && canManage) || !!onMakePublic;

    // Source badge logic
    const isGroupBook = !!book.groupId;
    const isPersonalBook = !book.groupId && book.ownerId === currentUserId;

    return (
        <Card
            className="group hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden flex flex-col !py-0 !gap-0"
            onClick={onClick}
        >
            {/* Cover du livre - Avec coins arrondis en haut */}
            <div className="aspect-[2/3] w-full bg-muted relative overflow-hidden rounded-t-xl">
                <img
                    src={`${serverUrl}/api/cover/${book.id}`}
                    alt={book.title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
                {/* Fallback visual avec titre centré */}
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-muted to-muted/80 -z-10 p-4">
                    <BookOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
                    <p className="text-xs text-muted-foreground/60 text-center line-clamp-3 font-medium leading-tight">
                        {book.title}
                    </p>
                    {book.author && (
                        <p className="text-[10px] text-muted-foreground/40 text-center mt-1 line-clamp-1">
                            {book.author}
                        </p>
                    )}
                </div>

                {/* Loading overlay */}
                {isLoading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    </div>
                )}

                {/* Overlay progression */}
                {book.progress && (
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/20">
                        <div
                            className="h-full bg-primary transition-all"
                            style={{ width: `${book.progress.progressPercentage ?? 0}%` }}
                        />
                    </div>
                )}

                {/* Badge progression */}
                {book.progress && (book.progress.progressPercentage ?? 0) > 0 && (
                    <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-medium px-2 py-0.5 rounded-full">
                        {book.progress.progressPercentage}%
                    </div>
                )}

                {/* Source indicator badge */}
                {showSourceBadge && (
                    isGroupBook && book.groupName ? (
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
                        <div className="absolute top-1.5 right-1.5 bg-green-500/90 text-white text-[8px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <Globe className="h-2.5 w-2.5 flex-shrink-0" />
                            <span>Bibliothèque</span>
                        </div>
                    ) : isPersonalBook ? (
                        <div className="absolute top-1.5 right-1.5 bg-gray-500/90 text-white text-[8px] font-medium px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            <User className="h-2.5 w-2.5 flex-shrink-0" />
                            <span>Personnel</span>
                        </div>
                    ) : null
                )}

                {/* Actions Menu */}
                {showActions && (
                    <div
                        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()} // Prevent card click
                    >
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                className="h-6 w-6 shadow-md bg-black/50 hover:bg-black/70 text-white rounded-md flex items-center justify-center"
                            >
                                <MoreVertical className="h-3.5 w-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {onMakePublic && (
                                    <DropdownMenuItem
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm("Rendre ce livre accessible à tous dans la bibliothèque publique ?")) {
                                                onMakePublic();
                                            }
                                        }}
                                    >
                                        <Share2 className="h-4 w-4 mr-2" />
                                        Rendre public
                                    </DropdownMenuItem>
                                )}
                                {onDelete && (
                                    <DropdownMenuItem
                                        variant="destructive"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm("Voulez-vous vraiment supprimer ce livre ?")) {
                                                onDelete();
                                            }
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Supprimer
                                    </DropdownMenuItem>
                                )}
                                {onRemoveFromGroup && (
                                    <DropdownMenuItem
                                        variant="destructive"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm("Voulez-vous vraiment retirer ce livre du groupe ?")) {
                                                onRemoveFromGroup();
                                            }
                                        }}
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Retirer du groupe
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
            </div>

            <div className="px-3 py-2.5 min-h-[52px]">
                <h3 className="font-medium text-xs line-clamp-2 leading-snug"
                    title={book.title}>
                    {book.title}
                </h3>
                {book.author && (
                    <p className="text-[10px] text-muted-foreground line-clamp-1">
                        {book.author}
                    </p>
                )}
                {/* Added date for consistency if needed, but MyBooks didn't have it in the card originally, only GroupDetail did. 
            GroupDetail displayed it. MyBooks displayed it only in the new design? 
            Checking my-books.tsx I see it didn't display date in the simplified card, but maybe it should?
            Let's check the previous file content for MyBooks.
            MyBooks card content:
            <div className="px-3 py-2.5 min-h-[52px]">
                <h3 ...>{book.title}</h3>
                {book.author && <p...>{book.author}</p>}
            </div>
            GroupDetail card content:
            <div className="px-3 py-2.5 min-h-[52px]">
                <h3 ...>{book.title}</h3>
                {book.author && ...}
                <p className="text-[10px] text-muted-foreground/60 mt-1">Ajouté le ...</p>
            </div>
            
            Result: I will add the date if `createdAt` is passed and formatted? 
            The prop `createdAt` is a string or Date.
            MyBooks passes the whole book object, which likely has createdAt.
            I'll conditionally render date if provided to keep it flexible, 
            or just render it always as it's useful info.
            However, MyBooks `BookCard` didn't have it in the snippet I read.
            I'll include it as it's better UI.
        */}
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                    Ajouté le {new Date(book.createdAt).toLocaleDateString("fr-FR")}
                </p>
            </div>
        </Card>
    );
}
