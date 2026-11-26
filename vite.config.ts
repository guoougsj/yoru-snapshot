import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const path = id.replaceAll("\\", "/");
          if (path.includes("/node_modules/react/") || path.includes("/node_modules/react-dom/")) {
            return "react-vendor";
          }
          if (path.includes("/node_modules/lucide-react/")) return "ui-vendor";
          if (path.endsWith("/data/live-seed.json")) return "library-seed";
        },
      },
    },
  },
});
