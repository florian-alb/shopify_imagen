import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tanstackStart({
      srcDirectory: "app"
    }),
    // Nitro builds the server output. Locally it defaults to the Node preset
    // (.output/server/index.mjs). On Vercel it auto-detects the platform
    // (VERCEL env) and emits the Build Output API format under .vercel/output.
    nitro(),
    tailwindcss(),
    react()
  ],
  resolve: {
    tsconfigPaths: true
  },
  ssr: {
    noExternal: ["@convex-dev/auth"]
  }
});
