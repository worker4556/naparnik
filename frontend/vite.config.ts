/// <reference types="vitest/config" />
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 127.0.0.1 вместо localhost: VPN часто ломает резолв localhost / ::1
const LOCAL = "127.0.0.1";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: LOCAL,
    port: 5173,
    strictPort: true,
    hmr: { host: LOCAL },
    proxy: {
      "/api": { target: `http://${LOCAL}:8080`, changeOrigin: true },
    },
  },
  preview: {
    host: LOCAL,
    port: 3000,
    strictPort: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
