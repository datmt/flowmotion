import { defineConfig } from "vite";

export default defineConfig({
  root: new URL("./dev", import.meta.url).pathname,
  publicDir: false,
  server: { fs: { allow: ["../../.."] } },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    lib: { entry: "../src/index.ts", formats: ["es"], fileName: "flow-player" },
  },
});
