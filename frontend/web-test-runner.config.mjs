import { playwrightLauncher } from "@web/test-runner-playwright";
import { esbuildPlugin } from "@web/dev-server-esbuild";

export default {
  files: "src/__tests__/**/*.wtr.ts",
  nodeResolve: true,
  concurrentBrowsers: 1,
  browsers: [
    playwrightLauncher({
      product: "chromium",
      launchOptions: {
        headless: true
      }
    })
  ],
  plugins: [
    esbuildPlugin({
      ts: true,
      target: "es2022"
    })
  ]
};
