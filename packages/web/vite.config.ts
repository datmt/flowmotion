import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";

const api = { target: process.env.API_URL ?? "http://localhost:3000" };
export default defineConfig({
  plugins: [react(), tailwind()],
  server: { fs: { allow: ["../.."] }, proxy: { "/api": api, "/mcp": api, "/schema": api, "/llms.txt": api } },
});
