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
    coverage: {
      provider: 'v8',
      // Cobertura de todo o código da aplicação, mesmo dos arquivos que nenhum teste importa:
      // sem isso o percentual ignoraria exatamente o que não está testado.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts', 'src/main.tsx', 'src/vite-env.d.ts'],
      reporter: ['text-summary', 'lcov'],
      // Meta do curso para o frontend: 25% das linhas. Abaixo disso o CI falha.
      thresholds: { lines: 25 },
    },
  },
})
