import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { viteSRIPlugin } from "./vite-plugin-sri";

const DEFAULT_BACKEND = "http://localhost:8081";

function resolveBackendOrigin(): string {
  const candidates = [
    process.env.VITE_BACKEND_ORIGIN,
    process.env.VITE_ADMIN_BASE,
    process.env.VITE_API_BASE,
  ].filter(Boolean) as string[];

  for (const value of candidates) {
    try {
      return new URL(value).origin;
    } catch {
      // ignore and try the next value
    }
  }

  return DEFAULT_BACKEND;
}

const backendOrigin = resolveBackendOrigin();

const createProxy = () => ({
  "/api": {
    target: backendOrigin,
    changeOrigin: true,
  },
  "/admin": {
    target: backendOrigin,
    changeOrigin: true,
    bypass(req) {
      const acceptHeader = req.headers["accept"];
      if (acceptHeader && acceptHeader.includes("text/html")) {
        return req.url;
      }
      return null;
    },
  },
  "/stats": {
    target: backendOrigin,
    changeOrigin: true,
  },
});

// https://vitejs.dev/config/
export default defineConfig({
  appType: 'spa',
  plugins: [
    viteSRIPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      includeAssets: ["fonts/lesson-sans.woff2", "icons/icon-512.png"],
      devOptions: {
        enabled: false,  // Disable SW in dev mode to avoid caching issues
        suppressWarnings: true
      },
      manifest: {
        name: "TrainingGround Lessons",
        short_name: "Lessons",
        description: "PWA-???????? ??????? ? ?????????, ??????????? ? ??????-???????",
        start_url: "/",
        display: "standalone",
        background_color: "#0b1521",
        theme_color: "#2563eb",
        lang: "ru",
        orientation: "portrait-primary",
        categories: ["education", "productivity"],
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable"
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version)
  },
  server: {
    port: 5173,  // Changed to default Vite dev server port
    open: false,
    proxy: createProxy(),
  },
  preview: {
    port: 4173,
    proxy: createProxy(),
  },
  build: {
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});
