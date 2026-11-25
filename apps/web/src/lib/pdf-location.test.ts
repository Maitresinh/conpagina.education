import { expect, test } from 'bun:test';
import { normalizePdfRects, parsePdfLocation, pdfLocation, pdfProgress } from './pdf-location';

test('selection coordinates stay attached to the same passage after zoom', () => {
  const normal = normalizePdfRects([{ left: 150, top: 240, right: 250, bottom: 260 }], { left: 100, top: 200, width: 500, height: 800 });
  const zoomed = normalizePdfRects([{ left: 200, top: 280, right: 400, bottom: 320 }], { left: 100, top: 200, width: 1000, height: 1600 });
  expect(normal).toEqual(zoomed);
  expect(parsePdfLocation(pdfLocation(4, normal))).toEqual({ page: 4, rects: normal });
});

test('a page-only comment and saved progress can both navigate back to their PDF page', () => {
  expect(parsePdfLocation(pdfLocation(3))).toEqual({ page: 3, rects: [] });
  expect(parsePdfLocation('pdf:page:3')?.page).toBe(3);
  expect(pdfProgress('pdf:page:3', 5)).toBe(0.5);
  expect(pdfProgress('pdf:page:5', 5)).toBe(1);
});

test('malformed or foreign locations cannot create invalid overlays', () => {
  for (const value of ['epubcfi(/6/2)', 'pdf:page:0', 'pdf:v1:null', 'pdf:v1:{', pdfLocation(-1), pdfLocation(2, [{x: 2, y: 0, width: 1, height: 1}])]) {
    expect(parsePdfLocation(value)).toBeNull();
  }
  expect(normalizePdfRects([{left: -20, top: -30, right: 10, bottom: 15}], {left: 0, top: 0, width: 100, height: 100})).toEqual([{x: 0, y: 0, width: 0.1, height: 0.15}]);
});
