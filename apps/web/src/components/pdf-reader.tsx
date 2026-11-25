"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, MessageSquarePlus, Minus, Plus } from 'lucide-react';
import { Button } from './ui/button';
import type { Annotation } from '@/hooks/use-epub-annotations';
import { normalizePdfRects, parsePdfLocation, pdfLocation, pdfProgress } from '@/lib/pdf-location';
import 'react-pdf/dist/Page/TextLayer.css';

const assetRoot = `/pdfjs/${pdfjs.version}/`;
pdfjs.GlobalWorkerOptions.workerSrc = `${assetRoot}pdf.worker.min.mjs`;
const options = {
  withCredentials: true, isEvalSupported: false,
  cMapUrl: `${assetRoot}cmaps/`, standardFontDataUrl: `${assetRoot}standard_fonts/`, wasmUrl: `${assetRoot}wasm/`,
};

interface Props {
  url: string;
  initialLocation?: string | null;
  annotations: Annotation[];
  isReadOnly?: boolean;
  onTextSelect: (location: string, text: string, rect: DOMRect) => void;
  onAnnotationClick: (annotation: Annotation, rect: DOMRect) => void;
  onLocationChange: (location: string) => void;
  getRendition: (rendition: any) => void;
  onLocationsReady: () => void;
}

export default function PdfReader(props: Props) {
  const callbacks = useRef(props);
  callbacks.current = props;
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(600);
  const [pageReady, setPageReady] = useState(false);
  const [hasText, setHasText] = useState(true);
  const [error, setError] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const pageRef = useRef(page);
  pageRef.current = page;
  const file = useMemo(() => ({ url: props.url }), [props.url]);

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(220, entries[0].contentRect.width - 32)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const navigate = (next: number) => {
    if (!Number.isFinite(next)) return;
    const destination = Math.max(1, Math.min(total, Math.trunc(next)));
    if (destination !== pageRef.current) setPageReady(false);
    setPage(destination);
    viewport.current?.scrollTo({ top: 0, left: 0 });
    window.getSelection()?.removeAllRanges();
  };
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    if (!total) return;
    callbacks.current.getRendition({
      prev: () => navigateRef.current(pageRef.current - 1),
      next: () => navigateRef.current(pageRef.current + 1),
      display: (location: string) => {
        const anchor = parsePdfLocation(location);
        if (anchor) { navigateRef.current(anchor.page); setTarget(location); }
      },
      currentLocation: () => ({ start: { cfi: `pdf:page:${pageRef.current}` } }),
      book: { locations: { percentageFromCfi: (location: string) => pdfProgress(location, total) } },
    });
    callbacks.current.onLocationsReady();
  }, [total]);

  useEffect(() => {
    if (total) callbacks.current.onLocationChange(`pdf:page:${page}`);
  }, [page, total]);

  useEffect(() => {
    if (!target || !pageReady) return;
    const element = Array.from(sheet.current?.querySelectorAll<HTMLElement>('[data-pdf-anchor]') || [])
      .find(el => el.dataset.pdfAnchor === target);
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTarget(null);
  }, [target, pageReady]);

  const captureSelection = () => {
    if (props.isReadOnly || !pageReady) return;
    const selection = window.getSelection();
    const layer = sheet.current?.querySelector('.textLayer');
    if (!selection?.rangeCount || selection.isCollapsed || !sheet.current || !layer) return;
    const range = selection.getRangeAt(0);
    if (!layer.contains(range.startContainer) || !layer.contains(range.endContainer)) return;
    const text = selection.toString().trim();
    if (!text) return;
    const rects = normalizePdfRects(Array.from(range.getClientRects()), sheet.current.getBoundingClientRect());
    if (rects.length) props.onTextSelect(pdfLocation(page, rects), text, range.getBoundingClientRect());
  };

  const pageAnnotations = props.annotations.flatMap(annotation => {
    if (annotation.parentId) return [];
    const anchor = parsePdfLocation(annotation.cfiRange);
    return anchor?.page === page ? [{ annotation, anchor }] : [];
  });

  return <div className="h-full min-h-0 flex flex-col bg-neutral-100 dark:bg-neutral-900">
    <div className="flex flex-wrap items-center justify-center gap-1 border-b p-2 bg-background" aria-label="Navigation PDF">
      <Button variant="ghost" size="icon" aria-label="Page précédente" disabled={!total || page <= 1} onClick={() => navigate(page - 1)}><ChevronLeft className="size-4" /></Button>
      <label className="flex items-center gap-2 text-sm">Page
        <input aria-label="Numéro de page" type="number" min={1} max={total || 1} value={page} disabled={!total}
          onChange={e => { if (e.target.value) navigate(Number(e.target.value)); }} className="w-16 border rounded px-2 py-1 bg-background" />
        <span aria-live="polite">/ {total || '…'}</span>
      </label>
      <Button variant="ghost" size="icon" aria-label="Page suivante" disabled={!total || page >= total} onClick={() => navigate(page + 1)}><ChevronRight className="size-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Réduire le zoom" disabled={zoom <= 0.5} onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}><Minus className="size-4" /></Button>
      <span className="text-xs w-10 text-center">{Math.round(zoom * 100)} %</span>
      <Button variant="ghost" size="icon" aria-label="Agrandir le zoom" disabled={zoom >= 3} onClick={() => setZoom(z => Math.min(3, z + 0.25))}><Plus className="size-4" /></Button>
      {!props.isReadOnly && <Button variant="outline" size="sm" disabled={!pageReady} onClick={event => props.onTextSelect(pdfLocation(page), `Page ${page}`, event.currentTarget.getBoundingClientRect())}>
        <MessageSquarePlus className="size-4 mr-1" />Commenter la page
      </Button>}
    </div>
    {error && <p role="alert" className="p-4 text-red-700 bg-red-50">{error}</p>}
    {!hasText && pageReady && <p className="px-4 py-2 text-sm">Cette page est une image : utilisez « Commenter la page » pour l’annoter.</p>}
    <div ref={viewport} className="flex-1 min-h-0 overflow-auto p-4" onMouseUp={captureSelection} onTouchEnd={() => setTimeout(captureSelection, 80)}>
      <Document file={file} options={options} suspense={false}
        onLoadSuccess={({ numPages }) => {
          setError('');
          setPage(Math.min(numPages, parsePdfLocation(callbacks.current.initialLocation)?.page ?? 1));
          setTotal(numPages);
        }}
        onLoadError={() => setError('Impossible de lire ce PDF. Vérifiez que le fichier est valide et accessible.')}
        onPassword={() => setError('Ce PDF est protégé par un mot de passe. Importez une copie déverrouillée pour la lecture en classe.')}
        loading={<p className="p-6 text-center" role="status">Chargement du PDF…</p>}
        error={<p className="p-6 text-center">Le PDF n’a pas pu être ouvert.</p>}
      >
        {total > 0 && <div ref={sheet} key={page} className="relative mx-auto bg-white shadow-md" style={{ width: Math.round(Math.min(width, 1000) * zoom) }}>
          <Page pageNumber={page} width={Math.round(Math.min(width, 1000) * zoom)} devicePixelRatio={Math.min(window.devicePixelRatio || 1, 2)}
            renderAnnotationLayer={false} renderTextLayer suspense={false}
            onRenderSuccess={() => setPageReady(true)} onRenderError={() => setError('Cette page n’a pas pu être affichée.')}
            onGetTextSuccess={({ items }) => setHasText(items.some(item => 'str' in item && item.str.trim().length > 0))}
            loading={<p className="p-6 text-center">Chargement de la page…</p>} />
          {pageReady && <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 3 }}>
            {pageAnnotations.map(({ annotation, anchor }) => anchor.rects.map((rect, index) => <button
              key={`${annotation.id}-${index}`} type="button" tabIndex={index === 0 ? 0 : -1} data-pdf-anchor={annotation.cfiRange}
              aria-label={`Annotation de ${annotation.author?.name || 'lecteur'} : ${annotation.comment || annotation.selectedText}`}
              onClick={event => props.onAnnotationClick(annotation, event.currentTarget.getBoundingClientRect())}
              className="absolute pointer-events-auto focus:outline-2 focus:outline-indigo-600"
              style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%`, backgroundColor: annotation.highlightColor, opacity: 0.35 }} />))}
          </div>}
        </div>}
      </Document>
      {pageAnnotations.filter(a => !a.anchor.rects.length).map(({ annotation }) => <button key={annotation.id}
        className="block mx-auto mt-2 text-sm underline" onClick={event => props.onAnnotationClick(annotation, event.currentTarget.getBoundingClientRect())}>
        💬 {annotation.author?.name || 'Lecteur'} — {annotation.comment || `Page ${page}`}
      </button>)}
    </div>
  </div>;
}
