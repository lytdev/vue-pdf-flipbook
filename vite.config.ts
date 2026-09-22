import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      name: 'VuePdfFlipbookNext',
      formats: ['es'],
      fileName: () => 'vue-pdf-flipbook.js',
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        assetFileNames: (assetInfo) =>
          assetInfo.names?.some((name) => name.endsWith('.css'))
            ? 'vue-pdf-flipbook.css'
            : 'assets/[name]-[hash][extname]',
      },
    },
  },
})
