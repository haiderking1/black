import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // `ws` is a transitive dependency of @effect/platform-node, so
        // externalizeDepsPlugin does not catch it. Bundling it breaks the
        // WebSocket upgrade: rollup turns `ws`'s optional requires for its
        // native addons into hard throws, and every upgrade dies there.
        // Required from node_modules at runtime instead.
        external: ['electron', 'ws', 'bufferutil', 'utf-8-validate'],
        input: {
          index: resolve(__dirname, 'backend/main.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['electron'],
        input: {
          index: resolve(__dirname, 'backend/preload.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs'
        }
      }
    }
  },
  renderer: {
    root: 'frontend',
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'frontend/index.html')
        }
      }
    }
  }
})
