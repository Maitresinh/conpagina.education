"use client";

import { parsePdfLocation } from "@/lib/pdf-location";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { X, ChevronDown, ChevronUp, MessageCircle, MapPin, BookOpen, Clock, Pencil, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { AnnotationThread } from "./annotation-thread";
import type { Annotation } from "@/hooks/use-epub-annotations";
import { cn } from "@/lib/utils";

type SortMode = 'chapter' | 'date';

interface TocItem {
  label: string;
  href: string;
}

interface AnnotationsPanelProps {
  annotations: Annotation[];
  currentUserId: string;
  isTeacher?: boolean;
  isReadOnly?: boolean;
  groupId?: string | null;
  bookTitle?: string;
  toc?: TocItem[];
  rendition?: any;
  focusedAnnotationId?: string | null;
  onNavigate: (cfiRange: string) => void;
  onUpdateComment: (id: string, comment: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

// Extracted component for rendering a single annotation
interface AnnotationItemProps {
  annotation: Annotation;
  isOwn: boolean;
  isCitationExpanded: boolean;
  showChapter: boolean;
  chapterLabel: string | null;
  currentUserId: string;
  isTeacher: boolean;
  isReadOnly: boolean;
  isFocused: boolean;
  onNavigate: (cfiRange: string) => void;
  onClose: () => void;
  onToggleCitation: (id: string) => void;
  onUpdateComment: (id: string, comment: string) => void;
  onDelete: (id: string) => void;
}

function AnnotationItem({
  annotation,
  isOwn,
  isCitationExpanded,
  showChapter,
  chapterLabel,
  currentUserId,
  isTeacher,
  isReadOnly,
  isFocused,
  onNavigate,
  onClose,
  onToggleCitation,
  onUpdateComment,
  onDelete,
}: AnnotationItemProps) {
  const hasLongCitation = annotation.selectedText.length > 80;
  const [isEditing, setIsEditing] = useState(false);
  const [editedComment, setEditedComment] = useState(annotation.comment || "");
  const itemRef = useRef<HTMLDivElement>(null);

  // Scroll into view when focused
  useEffect(() => {
    if (isFocused && itemRef.current) {
      // Small delay to ensure panel is rendered
      setTimeout(() => {
        itemRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  }, [isFocused]);

  const handleSaveEdit = () => {
    onUpdateComment(annotation.id, editedComment);
    setIsEditing(false);
  };

  const handleDelete = () => {
    if (confirm("Supprimer cette annotation ?")) {
      onDelete(annotation.id);
    }
  };

  return (
    <div 
      ref={itemRef}
      className={cn(
        "border-b border-neutral-100 dark:border-neutral-800/50 last:border-b-0 transition-colors duration-500",
        isFocused && "bg-indigo-50 dark:bg-indigo-950/30 ring-2 ring-indigo-500 ring-inset"
      )}
    >
      <div className="px-4 py-3">
        {/* Author + Navigation */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            {isOwn ? "Vous" : annotation.author?.name || "Anonyme"}
          </span>
          {/* Navigation button */}
          <span className="text-neutral-300 dark:text-neutral-600">•</span>
          <button
            onClick={() => {
              onNavigate(annotation.cfiRange);
              onClose();
            }}
            className="flex items-center gap-1 text-xs text-neutral-400 hover:text-indigo-600 dark:hover:text-indigo-400 active:text-indigo-700 transition-colors group p-1.5 -m-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800"
            title="Aller à cet emplacement"
          >
            <MapPin className="h-4 w-4" />
            {showChapter && chapterLabel && (
              <span className="truncate max-w-[150px] group-hover:underline">{chapterLabel}</span>
            )}
          </button>
        </div>

        {/* Citation - highlighted like in text, click to expand/collapse */}
        <div className="flex items-start gap-2">
          <button
            onClick={() => {
              if (hasLongCitation) {
                onToggleCitation(annotation.id);
              } else {
                onNavigate(annotation.cfiRange);
                onClose();
              }
            }}
            className="flex-1 text-left group cursor-pointer"
            title={hasLongCitation ? (isCitationExpanded ? "Cliquer pour réduire" : "Cliquer pour voir tout") : "Cliquer pour y aller"}
          >
            <span
              className="block overflow-hidden"
              style={{
                lineHeight: 1.2,
                maxHeight: !isCitationExpanded && hasLongCitation ? '2.4em' : undefined,
              }}
            >
              <span
                className={cn(
                  "text-xs leading-[1.2] px-0.5 -mx-0.5 transition-colors",
                  "hover:opacity-90"
                )}
                style={{
                  color: '#0a0a0a',
                  backgroundImage: `linear-gradient(transparent 2%, ${annotation.highlightColor} 5%)`,
                  WebkitBoxDecorationBreak: 'clone',
                  boxDecorationBreak: 'clone',
                  borderRadius: '0.2em',
                }}
              >
                {annotation.selectedText}
              </span>
            </span>
          </button>

          {hasLongCitation && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleCitation(annotation.id);
              }}
              className="mt-0.5 p-1 rounded-md text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              aria-label={isCitationExpanded ? "Réduire la citation" : "Voir toute la citation"}
              title={isCitationExpanded ? "Réduire" : "Voir tout"}
            >
              {isCitationExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        {/* Comment (if exists) - with edit mode and actions */}
        {isEditing ? (
          <div className="mt-2 space-y-2">
            <textarea
              value={editedComment}
              onChange={(e) => setEditedComment(e.target.value)}
              placeholder="Ajouter un commentaire..."
              className="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 resize-none"
              rows={3}
              autoFocus
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-3 py-1.5 text-xs font-medium bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 rounded-md hover:bg-neutral-700 dark:hover:bg-neutral-300 transition-colors"
              >
                Enregistrer
              </button>
            </div>
          </div>
        ) : annotation.comment ? (
          <div className="group/comment mt-2 flex items-start gap-1">
            <p className="flex-1 text-sm text-neutral-700 dark:text-neutral-200 leading-relaxed pl-3 border-l-2 border-neutral-200 dark:border-neutral-700">
              {annotation.comment}
            </p>
            {/* Edit/Delete actions - visible on hover */}
            {(isOwn || isTeacher) && !isReadOnly && (
              <div className="flex items-center gap-0.5 opacity-0 group-hover/comment:opacity-100 transition-opacity">
                <button
                  onClick={() => {
                    setIsEditing(true);
                    setEditedComment(annotation.comment || "");
                  }}
                  className="p-1.5 rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  title="Modifier"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-1.5 rounded text-neutral-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  title="Supprimer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ) : (
          /* No comment - show delete button for annotation owner/teacher */
          (isOwn || isTeacher) && !isReadOnly && (
            <div className="mt-2 flex items-center gap-1">
              <button
                onClick={() => {
                  setIsEditing(true);
                  setEditedComment("");
                }}
                className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
              >
                + Ajouter un commentaire
              </button>
              <span className="text-neutral-300 dark:text-neutral-600 mx-1">•</span>
              <button
                onClick={handleDelete}
                className="p-1 rounded text-neutral-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                title="Supprimer l'annotation"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        )}

        {/* Replies section - compact thread with input */}
        <div>
          <AnnotationThread
            annotationId={annotation.id}
            documentId={annotation.documentId}
            userId={currentUserId}
            isTeacher={isTeacher}
            isReadOnly={isReadOnly}
          />
        </div>
      </div>
    </div>
  );
}

export function AnnotationsPanel({
  annotations,
  currentUserId,
  isTeacher = false,
  isReadOnly = false,
  groupId,
  bookTitle,
  toc = [],
  rendition,
  focusedAnnotationId,
  onNavigate,
  onUpdateComment,
  onDelete,
  onClose,
}: AnnotationsPanelProps) {
  const [expandedCitation, setExpandedCitation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>('chapter');
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  
  // Ref for scroll container to auto-scroll in date mode
  const listRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when switching to date mode
  useEffect(() => {
    if (sortMode === 'date' && listRef.current) {
      // Small delay to ensure content is rendered
      setTimeout(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [sortMode]);

  // Find chapter for a given CFI
  const getChapterForCfi = useCallback((cfiRange: string): string | null => {
    const pdfAnchor = parsePdfLocation(cfiRange);
    if (pdfAnchor) return `Page ${pdfAnchor.page}`;
    if (!rendition?.book || !toc.length) return null;

    try {
      const book = rendition.book;
      // Extract the section/href from the CFI
      // CFI format: epubcfi(/6/4[section_id]!/4/2/1:0)
      // We need to find which TOC item this belongs to
      
      // Get the current location's href if possible
      const cfiParts = cfiRange.split('!');
      if (cfiParts.length < 1) return null;

      // Try to find matching spine item
      const spine = book.spine;
      if (!spine) return null;

      // Find the spine item that contains this CFI
      let matchedHref: string | null = null;
      
      for (const item of spine.spineItems || spine.items || []) {
        if (item.cfiBase && cfiRange.includes(item.cfiBase)) {
          matchedHref = item.href;
          break;
        }
      }

      // If we found a href, find the TOC item
      if (matchedHref) {
        // Remove any anchor from href for comparison
        const baseHref = matchedHref.split('#')[0];
        
        for (const tocItem of toc) {
          const tocHref = tocItem.href.split('#')[0];
          if (tocHref === baseHref || tocHref.endsWith(baseHref) || baseHref.endsWith(tocHref)) {
            return tocItem.label;
          }
        }
      }

      // Fallback: try to match by comparing CFI positions
      // Use the book's spine compare if available
      if (book.spine?.compare) {
        let lastMatch: string | null = null;
        for (const tocItem of toc) {
          try {
            // Get CFI for TOC item
            const tocCfi = book.spine.cfiFromHref?.(tocItem.href);
            if (tocCfi) {
              const comparison = book.spine.compare(cfiRange, tocCfi);
              if (comparison >= 0) {
                lastMatch = tocItem.label;
              }
            }
          } catch {
            // Continue to next item
          }
        }
        if (lastMatch) return lastMatch;
      }

      return null;
    } catch (e) {
      console.warn('Error getting chapter for CFI:', e);
      return null;
    }
  }, [rendition, toc]);

  // Filter out replies (annotations with parentId) and apply search
  const filteredAnnotations = useMemo(() => {
    const mainAnnotations = annotations.filter(a => !a.parentId);
    
    if (!searchQuery.trim()) return mainAnnotations;
    
    const query = searchQuery.toLowerCase();
    return mainAnnotations.filter(a => 
      a.selectedText.toLowerCase().includes(query) ||
      (a.comment && a.comment.toLowerCase().includes(query)) ||
      (a.author?.name && a.author.name.toLowerCase().includes(query))
    );
  }, [annotations, searchQuery]);

  // Group annotations by chapter
  const annotationsByChapter = useMemo(() => {
    const groups: Map<string, Annotation[]> = new Map();
    const noChapter: Annotation[] = [];

    for (const annotation of filteredAnnotations) {
      const chapter = getChapterForCfi(annotation.cfiRange);
      if (chapter) {
        if (!groups.has(chapter)) {
          groups.set(chapter, []);
        }
        groups.get(chapter)!.push(annotation);
      } else {
        noChapter.push(annotation);
      }
    }

    // Convert to array and sort by first annotation in each chapter (book order)
    const result: { chapter: string; annotations: Annotation[] }[] = [];
    
    // Get chapters in TOC order
    const tocOrder = toc.map(t => t.label);
    const sortedChapters = Array.from(groups.keys()).sort((a, b) => {
      const indexA = tocOrder.indexOf(a);
      const indexB = tocOrder.indexOf(b);
      if (indexA === -1 && indexB === -1) return a.localeCompare(b, "fr", { numeric: true });
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    for (const chapter of sortedChapters) {
      result.push({ chapter, annotations: groups.get(chapter)! });
    }

    if (noChapter.length > 0) {
      result.push({ chapter: 'Autre', annotations: noChapter });
    }

    return result;
  }, [filteredAnnotations, getChapterForCfi, toc]);

  // Sort annotations by date (newest last)
  const annotationsByDate = useMemo(() => {
    return [...filteredAnnotations].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateA - dateB; // oldest first, newest at bottom
    });
  }, [filteredAnnotations]);

  const toggleCitation = (id: string) => {
    setExpandedCitation(expandedCitation === id ? null : id);
  };

  const toggleChapter = (chapter: string) => {
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(chapter)) {
        next.delete(chapter);
      } else {
        next.add(chapter);
      }
      return next;
    });
  };

  // Expand all chapters by default on first render
  useMemo(() => {
    if (expandedChapters.size === 0 && annotationsByChapter.length > 0) {
      setExpandedChapters(new Set(annotationsByChapter.map(g => g.chapter)));
    }
  }, [annotationsByChapter.length]);

  // Ensure the chapter of the focused annotation is expanded
  useEffect(() => {
    if (focusedAnnotationId && sortMode === 'chapter') {
      const focusedAnnotation = filteredAnnotations.find(a => a.id === focusedAnnotationId);
      if (focusedAnnotation) {
        const chapter = getChapterForCfi(focusedAnnotation.cfiRange) || 'Autre';
        if (!expandedChapters.has(chapter)) {
          setExpandedChapters(prev => new Set([...prev, chapter]));
        }
      }
    }
  }, [focusedAnnotationId, sortMode, filteredAnnotations, getChapterForCfi]);

  return (
    <>
      {/* Backdrop - visible on mobile only */}
      <div 
        className="fixed inset-0 z-40 bg-black/30 lg:bg-black/10" 
        onClick={onClose}
      />

      {/* Panel - Full screen on mobile (including landscape), floating panel on desktop aligned with reader area */}
      <div className="fixed inset-0 lg:top-[100px] lg:bottom-4 lg:right-4 lg:left-auto z-50 w-full lg:w-[360px] xl:w-[400px] bg-white dark:bg-neutral-900 lg:rounded-2xl border-0 lg:border border-neutral-200 dark:border-neutral-800 flex flex-col animate-in slide-in-from-bottom lg:slide-in-from-right-5 duration-200 shadow-2xl lg:shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 dark:border-neutral-800">
          <h2 className="font-medium text-sm text-neutral-900 dark:text-neutral-100">
            {filteredAnnotations.length} annotation{filteredAnnotations.length !== 1 ? 's' : ''}
          </h2>
          <button 
            onClick={onClose}
            className="p-1.5 -mr-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="h-4 w-4 text-neutral-500" />
          </button>
        </div>

        {/* Sort toggle */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800/50">
          <button
            onClick={() => setSortMode('chapter')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              sortMode === 'chapter'
                ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 active:bg-neutral-100 dark:active:bg-neutral-800"
            )}
          >
            <BookOpen className="h-4 w-4" />
            Passages
          </button>
          <button
            onClick={() => setSortMode('date')}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              sortMode === 'date'
                ? "bg-neutral-100 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 active:bg-neutral-100 dark:active:bg-neutral-800"
            )}
          >
            <Clock className="h-4 w-4" />
            Date
          </button>
        </div>

        {/* Search - only show if many annotations */}
        {annotations.filter(a => !a.parentId).length > 5 && (
          <div className="px-4 py-2 border-b border-neutral-100 dark:border-neutral-800/50">
            <Input
              type="text"
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-sm bg-neutral-50 dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800"
            />
          </div>
        )}

        {/* Annotations list */}
        <div ref={listRef} className="flex-1 overflow-y-auto">
          {filteredAnnotations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {searchQuery ? "Aucun résultat" : "Aucune annotation"}
              </p>
            </div>
          ) : sortMode === 'chapter' ? (
            // Group by chapter view
            <div>
              {annotationsByChapter.map(({ chapter, annotations: chapterAnnotations }) => {
                const isChapterExpanded = expandedChapters.has(chapter);
                return (
                  <div key={chapter} className="border-b border-neutral-200 dark:border-neutral-800 last:border-b-0">
                    {/* Chapter header */}
                    <button
                      onClick={() => toggleChapter(chapter)}
                      className="w-full flex items-center justify-between px-4 py-2.5 bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-3.5 w-3.5 text-neutral-400" />
                        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300 truncate max-w-[200px]">
                          {chapter}
                        </span>
                        <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
                          ({chapterAnnotations.length})
                        </span>
                      </div>
                      {isChapterExpanded ? (
                        <ChevronUp className="h-4 w-4 text-neutral-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-neutral-400" />
                      )}
                    </button>
                    
                    {/* Chapter annotations */}
                    {isChapterExpanded && (
                      <div>
                        {chapterAnnotations.map((annotation) => (
                          <AnnotationItem
                            key={annotation.id}
                            annotation={annotation}
                            isOwn={annotation.userId === currentUserId}
                            isCitationExpanded={expandedCitation === annotation.id}
                            showChapter={false}
                            chapterLabel={null}
                            currentUserId={currentUserId}
                            isTeacher={isTeacher}
                            isReadOnly={isReadOnly}
                            isFocused={focusedAnnotationId === annotation.id}
                            onNavigate={onNavigate}
                            onClose={onClose}
                            onToggleCitation={toggleCitation}
                            onUpdateComment={onUpdateComment}
                            onDelete={onDelete}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            // Date sorted view (newest at bottom)
            <div>
              {annotationsByDate.map((annotation) => (
                <AnnotationItem
                  key={annotation.id}
                  annotation={annotation}
                  isOwn={annotation.userId === currentUserId}
                  isCitationExpanded={expandedCitation === annotation.id}
                  showChapter={true}
                  chapterLabel={getChapterForCfi(annotation.cfiRange)}
                  currentUserId={currentUserId}
                  isTeacher={isTeacher}
                  isReadOnly={isReadOnly}
                  isFocused={focusedAnnotationId === annotation.id}
                  onNavigate={onNavigate}
                  onClose={onClose}
                  onToggleCitation={toggleCitation}
                  onUpdateComment={onUpdateComment}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </div>

        {/* Read-only indicator */}
        {isReadOnly && (
          <div className="px-4 py-2 text-center text-[11px] text-amber-600 dark:text-amber-500 border-t border-neutral-200 dark:border-neutral-800 bg-amber-50 dark:bg-amber-950/30">
            Lecture seule
          </div>
        )}
      </div>
    </>
  );
}
