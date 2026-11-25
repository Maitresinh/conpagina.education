export const DOCUMENT_ACCEPT = '.epub,.pdf,application/epub+zip,application/pdf';
export const isReadingDocument = (file: Pick<File, 'name'>) => /\.(epub|pdf)$/i.test(file.name);
