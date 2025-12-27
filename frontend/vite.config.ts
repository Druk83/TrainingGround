import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { viteSRIPlugin } from "./vite-plugin-sri";

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
        description: "PWA-сценарий ученика с таймерами, подсказками и офлайн-режимом",
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
    proxy: {
      "/api": {
        target: process.env.VITE_API_BASE ?? "http://localhost:8081",
        changeOrigin: true
      },
      "/admin/templates": {
        target: "http://localhost:8081",
        changeOrigin: true
      },
      "/admin/queue": {
        target: "http://localhost:8081",
        changeOrigin: true
      },
      "/admin/feature-flags": {
        target: "http://localhost:8081",
        changeOrigin: true
      },
      "/stats": {
        target: "http://localhost:8081",
        changeOrigin: true
      }
    }
  },
  preview: {
    port: 4173,
    proxy: {
      "/api": {
        target: process.env.VITE_API_BASE ?? "http://localhost:8081",
        changeOrigin: true
      },
      "/admin/templates": {
        target: "http://localhost:8081",
        changeOrigin: true
      },
      "/admin/queue": {
        target: "http://localhost:8081",
        changeOrigin: true
      },
      "/admin/feature-flags": {
        target: "http://localhost:8081",
        changeOrigin: true
      },
      "/stats": {
        target: "http://localhost:8081",
        changeOrigin: true
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name]-[hash][extname]'
      }
    }
  }
});
