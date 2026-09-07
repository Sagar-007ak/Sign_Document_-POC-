import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxies /api requests to the Flask backend during development so the
// React app can call relative paths like fetch('/api/upload').
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
