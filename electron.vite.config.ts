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
        //
        // Photon loads its own WebAssembly file by reading a path relative to
        // its package directory. Bundling moves the code somewhere the wasm is
        // not, and the wasm is not copied into the output either, so image
        // decoding would fail at runtime in a packaged build while working
        // perfectly in development. Left external so it loads from node_modules
        // with its own file beside it.
        external: [
          'electron',
          'ws',
          'bufferutil',
          'utf-8-validate',
          '@silvia-odwyer/photon-node'
        ],
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
