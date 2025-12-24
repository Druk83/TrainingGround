import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      includeAssets: ["fonts/lesson-sans.woff2", "icons/icon-512.png"],
      devOptions: {
        enabled: true,
        suppressWarnings: true
      },
      manifest: {
        name: "TrainingGround PWA",
        short_name: "Lessons",
        start_url: "/",
        display: "standalone",
        background_color: "#0b1521",
        theme_color: "#3b82f6",
        lang: "ru",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png"
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
    port: 4173,
    open: false,
    proxy: {
      "/api": {
        target: process.env.VITE_API_BASE ?? "http://localhost:8081",
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 4173
  },
  build: {
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});
