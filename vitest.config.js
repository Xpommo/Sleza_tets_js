import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    exclude: ['tests/integration/**', 'node_modules/**'],
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      // Файл `script` без расширения — добавляем пустое расширение в whitelist,
      // иначе vitest пропускает его, считая не-JS.
      extension: ['', '.js'],
      include: ['script'],
      all: true,
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
    },
  },
});
