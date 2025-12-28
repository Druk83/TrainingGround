import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));

const unitProject = {
  test: {
    name: 'unit',
    include: ['src/**/*.{test,spec}.{ts,tsx,js}'],
    exclude: ['src/**/*.stories.*', 'src/**/*.mdx'],
    environment: 'happy-dom',
    setupFiles: [path.resolve(dirname, 'vitest.setup.ts')],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
    },
  },
};

const storybookPlugins = await storybookTest({
  configDir: path.join(dirname, '.storybook'),
});

const storybookProject = {
  plugins: storybookPlugins,
  test: {
    name: 'storybook',
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [
        {
          browser: 'chromium' as const,
        },
      ],
    },
    setupFiles: ['.storybook/vitest.setup.ts'],
  },
};

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  plugins: [],
  test: {
    projects: [unitProject, storybookProject],
  },
  resolve: {
    alias: {
      '@': path.resolve(dirname, 'src'),
    },
  },
});
