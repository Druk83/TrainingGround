import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  plugins: [],
  test: {
    environment: "happy-dom",
    setupFiles: [path.resolve(__dirname, "vitest.setup.ts")],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage"
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  }
});
