import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En développement, l'API et le WebSocket sont relayés vers le serveur Node (port 8787).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": "http://localhost:8787", "/ws": { target: "ws://localhost:8787", ws: true } } },
  build: { outDir: "dist", chunkSizeWarningLimit: 1200 },
});
