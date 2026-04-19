import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

const compatHooksPlugin = () => ({
  name: 'compat-hooks-plugin',
  transform(code, id) {
    if (id.includes('compat.module.js')) {
      return code + ';export const use=(...args)=>null;export const useOptimistic=(v)=>[v,()=>{}];'
    }
  },
})

export default defineConfig({
  plugins: [preact(), compatHooksPlugin()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  resolve: {
    alias: {
      react: 'preact/compat',
      'react-dom/test-utils': 'preact/test-utils',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (
              id.includes('preact') ||
              id.includes('react-router-dom') ||
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
