import path from 'node:path';

export function unreferencedReadingFiles<T extends { name: string }>(files: T[], documents: { filepath: string }[], cwd: string) {
  const referenced = new Set(documents.map(doc => path.resolve(cwd, doc.filepath)));
  return files.filter(file => /\.(epub|pdf)$/i.test(file.name)
    && !referenced.has(path.resolve(cwd, 'uploads', file.name)));
}

export function documentFormat(filename: string, mimeType: string, header: Uint8Array) {
  const extension = filename.split('.').pop()?.toLowerCase();
  const generic = mimeType === '' || mimeType === 'application/octet-stream';
  if (extension === 'pdf' && (generic || mimeType === 'application/pdf')
    && new TextDecoder().decode(header).match(/%PDF-\d\.\d/)) {
    return { extension: 'pdf', mimeType: 'application/pdf' } as const;
  }
  if (extension === 'epub' && (generic || mimeType === 'application/epub+zip' || mimeType === 'application/zip')
    && header[0] === 0x50 && header[1] === 0x4b && header[2] === 3 && header[3] === 4) {
    return { extension: 'epub', mimeType: 'application/epub+zip' } as const;
  }
  return null;
}
