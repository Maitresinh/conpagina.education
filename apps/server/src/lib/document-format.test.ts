import { expect, test } from 'bun:test';
import { documentFormat, unreferencedReadingFiles } from './document-format';
const bytes = (value: string) => new TextEncoder().encode(value);

test('PDF import accepts browser MIME variants and uppercase file extensions', () => {
  for (const mime of ['application/pdf', '', 'application/octet-stream']) {
    expect(documentFormat('Cours.PDF', mime, bytes('%PDF-1.7\n'))).toEqual({ extension: 'pdf', mimeType: 'application/pdf' });
  }
});
test('renamed HTML and mismatched formats are rejected before writing a file', () => {
  expect(documentFormat('Cours.pdf', 'application/pdf', bytes('<html>fake</html>'))).toBeNull();
  expect(documentFormat('Cours.epub', 'application/epub+zip', bytes('%PDF-1.7'))).toBeNull();
  expect(documentFormat('Cours.pdf', 'text/html', bytes('%PDF-1.7'))).toBeNull();
  expect(documentFormat('Cours.html', 'application/pdf', bytes('%PDF-1.7'))).toBeNull();
});
test('EPUB imports keep their own extension and canonical MIME', () => {
  expect(documentFormat('Livre.EPUB', '', new Uint8Array([0x50, 0x4b, 3, 4]))).toEqual({ extension: 'epub', mimeType: 'application/epub+zip' });
});

test('cleanup preserves PDF and EPUB files still referenced by copies with different document IDs', () => {
  const files = [{ name: 'original.pdf' }, { name: 'original.epub' }, { name: 'unused.pdf' }, { name: 'cover.jpg' }];
  const copies = [{ id: 'copy-a', filepath: 'uploads/original.pdf' }, { id: 'copy-b', filepath: 'uploads/original.epub' }];
  expect(unreferencedReadingFiles(files, copies, process.cwd())).toEqual([{ name: 'unused.pdf' }]);
});
