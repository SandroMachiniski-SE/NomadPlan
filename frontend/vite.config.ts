import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // globals liga a limpeza automática da Testing Library entre um teste e outro.
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
