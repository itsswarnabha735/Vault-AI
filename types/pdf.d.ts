/**
 * Type declaration for PDF.js served from /public/pdf.min.mjs.
 * This bypasses webpack bundling via dynamic import with webpackIgnore.
 */
declare module '/pdf.min.mjs' {
  export * from 'pdfjs-dist';
}
