import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// Where the game lives: "/monster-spil/" on GitHub Pages (the repo's name), "/" when the
// game server serves it itself (the Docker image builds it with VITE_BASE=/).
const base = process.env.VITE_BASE || "/monster-spil/";

export default defineConfig({
  base,
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
        start_url: base,
        scope: base,
        background_color: "#1f1f28",
        theme_color: "#1f1f28",
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
