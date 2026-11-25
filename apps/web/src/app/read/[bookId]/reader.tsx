"use client";

import dynamic from "next/dynamic";
import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowLeft, Cloud, CloudOff, Check, MessageSquareText } from "lucide-react";
import { trpc } from "@/utils/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HighlightToolbar } from "@/components/highlight-toolbar";
import { ReaderSettings } from "@/components/reader-settings";
import { AnnotationsPanel } from "@/components/annotations-panel";
import { ChapterProgressBar } from "@/components/chapter-progress-bar";
import { useEpubAnnotations, type Annotation } from "@/hooks/use-epub-annotations";
import EpubReader from "@/components/epub-reader";
import { useReaderContext } from "@/contexts/reader-context";
import { toast } from "sonner";
import "../annotations.css";

const PdfReader = dynamic(() => import("@/components/pdf-reader"), { ssr: false, loading: () => <p className="p-6">Chargement du lecteur PDF…</p> });

export default function Reader({ bookId, initialAnnotationId }: { bookId: string; initialAnnotationId?: string }) {
  const router = useRouter();
  const renditionRef = useRef<any>(null);
  const {
    setIsHeaderVisible: setGlobalHeaderVisible,
    setIsReaderPage,
    setSaveProgressCallback,
    currentLocationForReload,
    setCurrentLocationForReload
  } = useReaderContext();

  // Register as reader page on mount
  useEffect(() => {
    setIsReaderPage(true);
    return () => {
      setIsReaderPage(false);
      setGlobalHeaderVisible(true);
    };
  }, [setIsReaderPage, setGlobalHeaderVisible]);

  // Clear the context location after successful load (with delay to ensure it's used)
  useEffect(() => {
    if (currentLocationForReload) {
      const timeout = setTimeout(() => {
        console.log("🧹 Clearing context location after use");
        setCurrentLocationForReload(null);
      }, 3000); // Clear after 3 seconds to ensure navigation completed
      return () => clearTimeout(timeout);
    }
  }, [currentLocationForReload, setCurrentLocationForReload]);

  // UI States
  const [showHighlightToolbar, setShowHighlightToolbar] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [selectedCfiRange, setSelectedCfiRange] = useState("");
  const [toolbarPosition, setToolbarPosition] = useState({ x: 0, y: 0 });

  // Annotations panel state
  const [showAnnotationsPanel, setShowAnnotationsPanel] = useState(false);
  const [focusedAnnotationId, setFocusedAnnotationId] = useState<string | null>(null);
  const openedEmailThread = useRef<string | null>(null);
  const navigatedEmailThread = useRef<string | null>(null);

  // State to track when rendition is ready
  const [renditionReady, setRenditionReady] = useState(false);
  const [locationsReady, setLocationsReady] = useState(false);

  // Header visibility state for immersive reading (local state synced with global)
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);

  // TOC (table of contents) for chapter info
  const [toc, setToc] = useState<{ label: string; href: string }[]>([]);

  // Current page location tracking
  const [currentLocation, setCurrentLocation] = useState<string | null>(null);

  // Progress percentage for UI display
  const [currentProgressPercentage, setCurrentProgressPercentage] = useState<number>(0);

  // Save status indicator: only 2 states - unsaved (gray) or saved (green)
  const [saveStatus, setSaveStatus] = useState<'unsaved' | 'saved'>('saved');

  // Data
  const privateData = useQuery(trpc.privateData.queryOptions());
  const userId = (privateData.data?.user as any)?.id;


  const {
    annotations,
    addAnnotation,
    updateAnnotation,
    removeAnnotation
  } = useEpubAnnotations({
    bookId,
    userId
  });

  useEffect(() => {
    const key = `${bookId}:${initialAnnotationId}`;
    if (initialAnnotationId && openedEmailThread.current !== key && annotations.some(a => a.id === initialAnnotationId)) {
      openedEmailThread.current = key;
      setFocusedAnnotationId(initialAnnotationId);
      setShowAnnotationsPanel(true);
    }
  }, [bookId, initialAnnotationId, annotations]);

  const { data: bookData, isLoading, error } = useQuery(
    trpc.documents.getBook.queryOptions({ id: bookId })
  );

  // Vérifier si le document est en lecture seule (groupe archivé ou deadline passée)
  const { data: archiveStatus } = useQuery(
    trpc.reading.isDocumentArchived.queryOptions(
      { documentId: bookId },
      { enabled: !!bookData }
    )
  );

  const isReadOnly = (archiveStatus as any)?.isReadOnly || archiveStatus?.isArchived || false;

  const { data: progress, isPending: progressPending } = useQuery(
    trpc.reading.getProgress.queryOptions(
      { documentId: bookId },
      { enabled: !!bookData }
    )
  );

  const saveProgressMutation = useMutation(
    trpc.reading.saveProgress.mutationOptions()
  );

  const isPdf = bookData?.mimeType === "application/pdf";

  useEffect(() => {
    if (renditionReady && initialAnnotationId && navigatedEmailThread.current !== initialAnnotationId) {
      const annotation = annotations.find(a => a.id === initialAnnotationId);
      if (annotation) {
        renditionRef.current?.display(annotation.cfiRange);
        navigatedEmailThread.current = initialAnnotationId;
      }
    }
  }, [renditionReady, initialAnnotationId, annotations]);

  // Highlight creation
  const handleTextSelect = (cfiRange: string, text: string, rect: DOMRect) => {
    // Ne pas permettre de créer de nouvelles annotations si en lecture seule
    if (isReadOnly) {
      const message = archiveStatus?.isArchived
        ? "Ce groupe est archivé. Les annotations sont désactivées."
        : "L'échéance de ce groupe est passée. Les annotations sont désactivées.";
      toast.error(message);
      return;
    }
    setSelectedText(text);
    setSelectedCfiRange(cfiRange);
    setToolbarPosition({
      x: rect.right,
      y: rect.top - 40, // Position above the selection
    });
    setShowHighlightToolbar(true);
  };

  const handleCreateHighlight = async (color: string, comment: string) => {
    try {
      await addAnnotation({
        cfiRange: selectedCfiRange,
        selectedText,
        color,
        comment
      });
      setShowHighlightToolbar(false);
      toast.success("Annotation ajoutée");
    } catch (error) {
      console.error("Error creating highlight:", error);
      toast.error("Erreur lors de l'annotation");
    }
  };

  // Annotation interaction - open the hub instead of the old menu
  const handleAnnotationClick = (annotation: Annotation, rect: DOMRect) => {
    setFocusedAnnotationId(annotation.id);
    setShowAnnotationsPanel(true);
    setShowHighlightToolbar(false);
  };

  const handleUpdateAnnotation = async (id: string, comment: string) => {
    try {
      await updateAnnotation(id, comment);
      toast.success("Commentaire mis à jour");
    } catch (e) {
      toast.error("Erreur mise à jour");
    }
  };

  const handleRemoveAnnotation = async (id: string) => {
    try {
      await removeAnnotation(id);
      toast.success("Annotation supprimée");
    } catch (e) {
      toast.error("Erreur suppression");
    }
  };

  // Progress saving - extracted to useCallback for reuse
  const saveCurrentProgress = useCallback(() => {
    if (!bookId || !renditionRef.current || !locationsReady) return;

    try {
      const location = renditionRef.current?.currentLocation?.();
      if (!location?.start?.cfi) return;

      const cfi = location.start.cfi;
      const book = renditionRef.current.book;
      const percentage = book?.locations?.percentageFromCfi?.(cfi);
      const progressPercent = percentage ? Math.round(percentage * 100) : 0;

      // Update UI progress immediately
      setCurrentProgressPercentage(progressPercent);

      saveProgressMutation.mutate({
        documentId: bookId,
        currentLocation: cfi,
        progressPercentage: progressPercent,
      });
    } catch (e) {
      // Silently fail - progress saving is non-critical
    }
  }, [bookId, locationsReady, saveProgressMutation]);

  // Async version of saveCurrentProgress that waits for the save to complete
  const saveCurrentProgressAsync = useCallback(async (): Promise<void> => {
    if (!bookId || !renditionRef.current || !locationsReady) return;

    try {
      const location = renditionRef.current?.currentLocation?.();
      if (!location?.start?.cfi) return;

      const cfi = location.start.cfi;
      const book = renditionRef.current.book;
      const percentage = book?.locations?.percentageFromCfi?.(cfi);
      const progressPercent = percentage ? Math.round(percentage * 100) : 0;

      // Update UI progress immediately
      setCurrentProgressPercentage(progressPercent);

      console.log("📍 Saving progress async:", cfi, progressPercent + "%");

      // Store in context for immediate use after remount
      setCurrentLocationForReload(cfi);

      await saveProgressMutation.mutateAsync({
        documentId: bookId,
        currentLocation: cfi,
        progressPercentage: progressPercent,
      });

      console.log("✅ Progress saved successfully");
    } catch (e) {
      console.error("Failed to save progress:", e);
    }
  }, [bookId, locationsReady, saveProgressMutation]);

  // Keep a ref to the latest saveCurrentProgress for stable effect dependencies
  const saveProgressRef = useRef(saveCurrentProgress);
  useEffect(() => {
    saveProgressRef.current = saveCurrentProgress;
  }, [saveCurrentProgress]);

  // Keep a ref to the async version for context registration
  const saveProgressAsyncRef = useRef(saveCurrentProgressAsync);
  useEffect(() => {
    saveProgressAsyncRef.current = saveCurrentProgressAsync;
  }, [saveCurrentProgressAsync]);

  // Register async saveCurrentProgress in context so ReaderSettings can await it before mode switch
  // Note: we only register once on mount, the ref keeps the latest version
  useEffect(() => {
    // Create a stable wrapper that always calls the current ref
    const stableCallback = async () => {
      await saveProgressAsyncRef.current();
    };
    setSaveProgressCallback((() => stableCallback) as any);
    return () => setSaveProgressCallback(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSaveProgressCallback]);

  // Watch mutation state to update save status indicator
  useEffect(() => {
    if (saveProgressMutation.isSuccess) {
      setSaveStatus('saved');
    } else if (saveProgressMutation.isError) {
      setSaveStatus('unsaved');
    }
  }, [saveProgressMutation.isSuccess, saveProgressMutation.isError]);

  // Update progress bar visually on every location change (without saving to server)
  const handleLocationChange = useCallback((cfi: string) => {
    setCurrentLocation(cfi);

    // Update progress bar immediately for visual feedback
    if (renditionRef.current && locationsReady) {
      try {
        const book = renditionRef.current.book;
        const percentage = book?.locations?.percentageFromCfi?.(cfi);
        if (percentage !== undefined) {
          setCurrentProgressPercentage(Math.round(percentage * 100));
          // Mark as unsaved since local progress changed
          setSaveStatus('unsaved');
        }
      } catch (e) {
        // Ignore errors
      }
    }
  }, [locationsReady]);

  // Navigation handlers - no longer save, just navigate
  const handlePrev = useCallback(() => {
    renditionRef.current?.prev();
  }, []);

  const handleNext = useCallback(() => {
    renditionRef.current?.next();
  }, []);

  // Handle scroll direction change for immersive reading
  const handleScrollDirectionChange = useCallback((direction: 'up' | 'down') => {
    const visible = direction === 'up';
    setIsHeaderVisible(visible);
    setGlobalHeaderVisible(visible);
  }, [setGlobalHeaderVisible]);

  // Handle center tap to toggle header visibility (for paginated mode)
  const handleCenterTap = useCallback(() => {
    setIsHeaderVisible(prev => {
      const newValue = !prev;
      setGlobalHeaderVisible(newValue);
      return newValue;
    });
  }, [setGlobalHeaderVisible]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      } else if (e.key === "Escape") {
        setShowHighlightToolbar(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePrev, handleNext]);

  // Save progress on page leave (beforeunload), tab switch (visibilitychange), and component unmount
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveProgressRef.current();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveProgressRef.current();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Save on component unmount (covers browser back, router navigation, etc.)
    return () => {
      saveProgressRef.current();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []); // Empty deps - only run on mount/unmount

  // Periodic progress saving (backup, every 30 seconds)
  useEffect(() => {
    if (!bookId || !locationsReady) return;

    const interval = setInterval(() => saveProgressRef.current(), 30000);
    return () => clearInterval(interval);
  }, [bookId, locationsReady]); // Stable deps

  // PDF page changes are small, discrete progress updates. Save them promptly.
  useEffect(() => {
    if (!isPdf || !currentLocation || !locationsReady) return;
    setShowHighlightToolbar(false);
    const timeout = setTimeout(() => saveProgressRef.current(), 500);
    return () => clearTimeout(timeout);
  }, [isPdf, currentLocation, locationsReady]);

  // Initialize progress from saved data
  useEffect(() => {
    if (progress?.progressPercentage) {
      setCurrentProgressPercentage(progress.progressPercentage);
    }
  }, [progress]);



  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-0">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p>Chargement du livre...</p>
        </div>
      </div>
    );
  }

  if (error || !bookData) {
    return (
      <div className="flex items-center justify-center h-full min-h-0 p-4">
        <Card className="p-6 max-w-md">
          <h2 className="text-xl font-bold mb-4">Erreur</h2>
          <p className="text-gray-600 mb-4">Impossible de charger ce livre.</p>
          <Button onClick={() => router.push("/")}>
            Retour à l'accueil
          </Button>
        </Card>
      </div>
    );
  }

  const url = `${process.env.NEXT_PUBLIC_SERVER_URL}/api/files/${bookData.id}`;

  console.log("📚 Book data:", bookData);
  console.log("🔗 EPUB URL:", url);

  return (
    <div className="h-full min-h-0 flex flex-col bg-white dark:bg-black relative overflow-hidden">
      {/* Header - slides up/down based on scroll direction */}
      <div
        className={`absolute top-0 left-0 right-0 bg-white dark:bg-black border-b px-2 sm:px-4 py-1.5 sm:py-2 flex items-center justify-between shadow-sm z-50 transition-transform duration-300 ease-in-out ${isHeaderVisible ? 'translate-y-0' : '-translate-y-full'
          }`}
      >
        <Button variant="ghost" size="sm" onClick={() => {
          saveCurrentProgress();
          router.back();
        }} className="gap-1 px-1.5 sm:px-3 h-8 sm:h-9">
          <ArrowLeft className="h-4 w-4 sm:h-4 sm:w-4" />
          <span className="hidden sm:inline">Retour</span>
        </Button>
        <div className="flex-1 flex flex-col items-center mx-2 sm:mx-4">
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="font-semibold text-xs sm:text-sm truncate max-w-[150px] sm:max-w-md">{bookData.title}</h1>
              {/* Save status indicator - always visible */}
              <div
                className="flex items-center"
                title={saveStatus === 'saved' ? 'Sauvegardé' : 'Modifications non sauvegardées'}
              >
                {saveStatus === 'unsaved' ? (
                  <CloudOff className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-gray-400" />
                ) : (
                  <div className="flex items-center text-green-500">
                    <Cloud className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3 -ml-1" />
                  </div>
                )}
              </div>
            </div>
            {bookData.author && (
              <span className="text-[10px] sm:text-xs text-muted-foreground truncate max-w-[120px] sm:max-w-md hidden xs:inline">{bookData.author}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Annotations panel button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAnnotationsPanel(true)}
            className="gap-1 px-1.5 sm:px-3 h-8 sm:h-9 relative"
            title="Voir toutes les annotations"
          >
            <MessageSquareText className="h-5 w-5" />
            <span className="hidden sm:inline">Annotations</span>
            {annotations.filter(a => !a.parentId).length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 sm:relative sm:top-0 sm:right-0 bg-indigo-500 text-white text-[9px] sm:text-[10px] font-medium rounded-full min-w-4 h-4 sm:min-w-5 sm:h-5 flex items-center justify-center px-1">
                {annotations.filter(a => !a.parentId).length}
              </span>
            )}
          </Button>
          {!isPdf && <ReaderSettings />}
        </div>
      </div>

      {/* Reader area - takes full height, with top padding that transitions */}
      <div
        className={`flex-1 min-h-0 flex overflow-hidden transition-all duration-300 ease-in-out ${isHeaderVisible ? 'pt-[52px] sm:pt-[56px]' : 'pt-0'
          }`}
      >
        <div className="flex-1 relative overflow-hidden bg-white dark:bg-black">
          {isPdf ? (progressPending ? <p className="p-6">Chargement de la progression…</p> : <PdfReader
            key={bookId}
            url={url}
            initialLocation={progress?.currentLocation}
            annotations={annotations}
            isReadOnly={isReadOnly}
            onTextSelect={handleTextSelect}
            onAnnotationClick={handleAnnotationClick}
            onLocationChange={handleLocationChange}
            getRendition={r => { renditionRef.current = r; setRenditionReady(true); }}
            onLocationsReady={() => setLocationsReady(true)}
          />) : <EpubReader
            url={url}
            height="100%"
            initialLocation={currentLocationForReload || progress?.currentLocation}
            annotations={annotations}
            onTextSelect={handleTextSelect}
            onAnnotationClick={handleAnnotationClick}
            onLocationChange={handleLocationChange}
            onScrollDirectionChange={handleScrollDirectionChange}
            onCenterTap={handleCenterTap}
            getRendition={(r) => {
              renditionRef.current = r;
              // Mark rendition as ready after a short delay to ensure book is loaded
              setTimeout(() => {
                setRenditionReady(true);
                // Extract TOC from book
                try {
                  const book = r.book;
                  if (book?.navigation?.toc) {
                    const tocItems = book.navigation.toc.map((item: any) => ({
                      label: item.label,
                      href: item.href,
                    }));
                    setToc(tocItems);
                  }
                } catch (e) {
                  console.warn('Could not extract TOC:', e);
                }
              }, 500);
            }}
            onLocationsReady={() => setLocationsReady(true)}
          />}
        </div>
      </div>

      {/* Chapter Progress Bar */}
      {!isPdf && <ChapterProgressBar
        toc={toc}
        rendition={renditionRef.current}
        currentProgressPercentage={currentProgressPercentage}
        onProgressChange={(percentage) => {
          setCurrentProgressPercentage(percentage);
        }}
      />}

      {showHighlightToolbar && (
        <HighlightToolbar
          position={toolbarPosition}
          selectedText={selectedText}
          onHighlight={handleCreateHighlight}
          onClose={() => setShowHighlightToolbar(false)}
        />
      )}

      {showAnnotationsPanel && (
        <AnnotationsPanel
          annotations={annotations}
          currentUserId={userId || ""}
          isTeacher={bookData?.isTeacher || false}
          isReadOnly={isReadOnly}
          groupId={bookData?.groupId || null}
          bookTitle={bookData?.title ? `${bookData.title}${bookData.author ? ` - ${bookData.author}` : ''}` : "Livre"}
          toc={toc}
          rendition={renditionRef.current}
          focusedAnnotationId={focusedAnnotationId}
          onNavigate={(cfiRange) => {
            renditionRef.current?.display(cfiRange);
          }}
          onUpdateComment={handleUpdateAnnotation}
          onDelete={handleRemoveAnnotation}
          onClose={() => {
            setShowAnnotationsPanel(false);
            setFocusedAnnotationId(null);
          }}
        />
      )}
    </div>
  );
}
