import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

export default defineConfig({
  base: "/monster-spil/",
  resolve: {
    alias: {
      "@shared": path.resolve(import.meta.dirname, "../shared/src"),
    },
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "Monsterjagt",
        short_name: "Monsterjagt",
        description: "Et monster-fangerspil til hele familien",
        lang: "da",
        display: "fullscreen",
        // iPad and iPhone, held either way; every screen lays itself out for the current shape.
        orientation: "any",
        start_url: "/monster-spil/",
        scope: "/monster-spil/",
        background_color: "#1b1f3b",
        theme_color: "#1b1f3b",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,json,png,svg,mp3,wav,m4a}"],
      },
    }),
  ],
});
