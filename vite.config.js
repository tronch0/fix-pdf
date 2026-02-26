import { defineConfig } from "vite";

export default defineConfig({
  base: "/fix-pdf/",
  optimizeDeps: {
    exclude: ["mupdf"],
  },
  worker: {
    format: "es",
  },
});
