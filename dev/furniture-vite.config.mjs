// TEMP (delete after): the furniture harness server, without HMR so other edits don't reload the page mid-test,
// and tolerant of a stylesheet another change has not written yet.
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const missingCss = {
  name: 'missing-css',
  enforce: 'pre',
  resolveId(id, importer) {
    if (!id.endsWith('.css') || !importer || !id.startsWith('.')) return null;
    return existsSync(resolve(dirname(importer), id)) ? null : '\0empty.css';
  },
  load(id) { return id === '\0empty.css' ? '' : null; },
};
export default defineConfig({ root: new URL('..', import.meta.url).pathname, plugins: [missingCss, react()], server: { port: 5322, strictPort: true, hmr: false } });
