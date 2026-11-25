import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { cp, mkdir } from 'node:fs/promises';

// Serve worker, fonts and decoders from Conpagina itself, with the exact library version.
const require = createRequire(import.meta.url);
const pdfRequire = createRequire(require.resolve('react-pdf'));
const source = dirname(pdfRequire.resolve('pdfjs-dist/package.json'));
const { version } = pdfRequire('pdfjs-dist/package.json');
const target = join(import.meta.dir, '..', 'public', 'pdfjs', version);
await mkdir(target, { recursive: true });
for (const directory of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(join(source, directory), join(target, directory), { recursive: true });
}
await cp(join(source, 'build', 'pdf.worker.min.mjs'), join(target, 'pdf.worker.min.mjs'));
