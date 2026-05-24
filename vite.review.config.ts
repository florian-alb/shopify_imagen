import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "review-ui",
  plugins: [react()],
  build: {
    outDir: "../dist/review-ui",
    emptyOutDir: true
  },
  server: {
    port: 8788,
    proxy: {
      "/api": "http://localhost:8787",
      "/local-image": "http://localhost:8787"
    }
  }
});
