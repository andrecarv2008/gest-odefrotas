import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';
const r = (p: string) => path.resolve(__dirname, p);
export default defineConfig({
  plugins: [react(), tailwind(), viteSingleFile()],
  resolve: { alias: [
    { find: '@/firebase-applet-config.json', replacement: r('shim/firebase-applet-config.json') },
    { find: /^firebase\/app$/, replacement: r('shim/firebase-app.ts') },
    { find: /^firebase\/auth$/, replacement: r('shim/firebase-auth.ts') },
    { find: /^firebase\/firestore$/, replacement: r('shim/firebase-firestore.ts') },
    { find: /^@\//, replacement: r('') + '/' },
  ]},
  define: { __VIEWER__: JSON.stringify(process.env.VIEWER === '1') },
  build: { outDir: 'dist', assetsInlineLimit: 100000000, chunkSizeWarningLimit: 99999 },
});
