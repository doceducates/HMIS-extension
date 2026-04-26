import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import manifest from './manifest.json';

export default defineConfig({
  plugins: [
    crx({ manifest }),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/onnxruntime-web/dist/ort-wasm-*.{wasm,mjs}',
          dest: 'assets/wasm'
        }
      ]
    })
  ],
  build: {
    rollupOptions: {
      input: {
        // The offscreen document is a separate entry point
        'ai-offscreen': 'src/ai-offscreen.html',
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
  },
  // Ensure JSON files from src/data/ are included in the bundle
  json: {
    stringify: true,
  },
});
