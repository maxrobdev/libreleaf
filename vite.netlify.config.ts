import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "netlify",
  publicDir: "../public",
  plugins: [react()],
  build: {
    outDir: "../dist/netlify",
    emptyOutDir: true,
  },
});
