import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import preact from '@preact/preset-vite'

export default defineConfig({
  plugins: [preact({ reactAliasesEnabled: false })],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  resolve: {
    alias: [
      {
        find: /^react$/,
        replacement: fileURLToPath(new URL('./src/lib/preact-compat.js', import.meta.url)),
      },
      { find: /^react\/jsx-runtime$/, replacement: 'preact/jsx-runtime' },
      { find: /^react-dom$/, replacement: 'preact/compat' },
      { find: /^react-dom\/client$/, replacement: 'preact/compat/client' },
      { find: /^react-dom\/test-utils$/, replacement: 'preact/test-utils' },
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              id.includes('preact') ||
              id.includes('react-router') ||
              id.includes('@tanstack/react-query')
            ) {
              return 'vendor'
            }
          }
        },
      },
    },
  },
})
