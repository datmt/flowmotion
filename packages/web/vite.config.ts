import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

const api = { target: process.env.API_URL ?? "http://localhost:3000" };
export default defineConfig({
  plugins: [
    react(), tailwind(),
    // Node needs `with { type: "json" }` on the icon pack imports; in the browser the dev server serves JSON as JS, which the attribute rejects. Vite handles .json itself.
    { name: "icons-json-attr", enforce: "pre", transform: (code, id) => (id.includes("core/src/icons/index.ts") ? code.replace(/, \{ with: \{ type: "json" \} \}/g, "") : undefined) },
  ],
  server: { fs: { allow: ["../.."] }, proxy: { "/api": api, "/mcp": api, "/schema": api, "/llms.txt": api } },
});
