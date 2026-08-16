import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const entry = (path: string) => fileURLToPath(new URL(`./netlify/${path}`, import.meta.url));

export default defineConfig({
  root: "netlify",
  publicDir: "../public",
  plugins: [react()],
  build: {
    outDir: "../dist/netlify",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: entry("index.html"),
        search: entry("search/index.html"),
        lists: entry("lists/index.html"),
        about: entry("about/index.html"),
        resources: entry("resources/index.html"),
      },
    },
  },
});
