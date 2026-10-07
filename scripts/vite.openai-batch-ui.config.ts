import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Isolated fixture server; no app plugin, backend, or generated route tree.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { tsconfigPaths: true },
  server: { host: "127.0.0.1", port: 3003, strictPort: true },
});
