import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": `http://127.0.0.1:${process.env.API_PORT || "8000"}` },
  },
  build: {
    outDir: "dist",
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks: {
          "video-engine": ["remotion", "@remotion/player"],
          "react-core": ["react", "react-dom"],
        },
      },
    },
  },
});
