import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'ai-marketing',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'],
    environment: 'node',
  },
})
