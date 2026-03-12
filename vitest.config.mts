import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { resolve } from 'path'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    alias: {
      // server-only throws in JSDOM; replace with a no-op stub for tests
      'server-only': resolve('./src/__mocks__/server-only.ts'),
    },
  },
  test: {
    environment: 'jsdom',
  },
})