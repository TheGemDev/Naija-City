// TEMP (delete after): the furniture harness server, without HMR so other edits don't reload the page mid-test.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ root: new URL('..', import.meta.url).pathname, plugins: [react()], server: { port: 5322, strictPort: true, hmr: false } });
