// PDF positions are versioned and use normalized rectangles, so highlights survive zoom.
// Kept in the existing location column; EPUB CFIs remain unchanged.
export type PdfRect = { x: number; y: number; width: number; height: number };
export type PdfAnchor = { page: number; rects: PdfRect[] };

export function parsePdfLocation(value?: string | null): PdfAnchor | null {
  if (!value) return null;
  if (/^pdf:page:[1-9]\d*$/.test(value)) {
    const page = Number(value.slice(9));
    return Number.isSafeInteger(page) ? { page, rects: [] } : null;
  }
  if (!value.startsWith("pdf:v1:") || value.length > 50000) return null;
  try {
    const anchor = JSON.parse(value.slice(7));
    if (!Number.isSafeInteger(anchor.page) || anchor.page < 1 || !Array.isArray(anchor.rects) || anchor.rects.length > 200) return null;
    if (!anchor.rects.every((r: PdfRect) => r && [r.x, r.y, r.width, r.height].every(Number.isFinite)
      && r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0
      && r.x + r.width <= 1.001 && r.y + r.height <= 1.001)) return null;
    return anchor;
  } catch { return null; }
}

export function pdfLocation(page: number, rects: PdfRect[] = []): string {
  return `pdf:v1:${JSON.stringify({ page, rects })}`;
}

export function pdfProgress(location: string, total: number): number {
  const page = parsePdfLocation(location)?.page ?? 1;
  return total > 1 ? Math.max(0, Math.min(1, (page - 1) / (total - 1))) : 1;
}

export function normalizePdfRects(rects: Pick<DOMRect, "left" | "top" | "right" | "bottom">[], bounds: Pick<DOMRect, "left" | "top" | "width" | "height">): PdfRect[] {
  if (bounds.width <= 0 || bounds.height <= 0) return [];
  return rects.flatMap(r => {
    const x = Math.max(0, (r.left - bounds.left) / bounds.width);
    const y = Math.max(0, (r.top - bounds.top) / bounds.height);
    const right = Math.min(1, (r.right - bounds.left) / bounds.width);
    const bottom = Math.min(1, (r.bottom - bounds.top) / bounds.height);
    return right > x && bottom > y ? [{ x, y, width: right - x, height: bottom - y }] : [];
  }).slice(0, 200);
}
