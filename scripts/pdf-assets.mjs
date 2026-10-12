import { cp, mkdir } from 'node:fs/promises';
// PDFの日本語CMap・標準フォント等を同じオリジンから読み込む。
await mkdir('public/pdfjs', { recursive: true });
await cp('node_modules/pdfjs-dist/LICENSE', 'public/pdfjs/LICENSE');
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) {
  await cp(`node_modules/pdfjs-dist/${folder}`, `public/pdfjs/${folder}`, { recursive: true });
}
