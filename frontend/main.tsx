import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App } from './App'
import { PreviewProvider } from './lightbox'
import { ConnectionProvider } from './rpc'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false
    }
  }
})

const container = document.getElementById('root')
if (!container) {
  throw new Error('Failed to find root DOM element')
}

const root = createRoot(container)
root.render(
  <React.StrictMode>
    <ConnectionProvider>
      <QueryClientProvider client={queryClient}>
        {/* Above the app, so every image anywhere can open a preview without
            each of them owning an overlay of its own. */}
        <PreviewProvider>
          <App />
        </PreviewProvider>
      </QueryClientProvider>
    </ConnectionProvider>
  </React.StrictMode>
)
