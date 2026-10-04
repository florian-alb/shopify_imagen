import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// Isolated test harness: no app router, authentication, or backend connection.
export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port: 3001, strictPort: true },
})
