import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'tooling',
    include: ['evals/**/*.test.ts', 'redteam/**/*.test.ts', 'load/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
    environment: 'node',
  },
})
