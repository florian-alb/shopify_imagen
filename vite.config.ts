import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tanstackStart({
      srcDirectory: "app"
    }),
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
