// Static single-page app build: no server-side rendering at runtime.
// `npm run build` writes index.html + assets to ./dist, ready to be served by nginx.
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  server: { host: true, port: 8080 },
  css: { transformer: "lightningcss" },
  resolve: {
    tsconfigPaths: true,
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
      spa: {
        enabled: true,
        prerender: { outputPath: "/index.html", crawlLinks: false, retryCount: 0 },
      },
    }),
    viteReact(),
  ],
  environments: {
    client: { build: { outDir: "dist" } },
    // Build-time only bundle used to render the SPA shell; never deployed.
    ssr: { build: { outDir: "node_modules/.cache/spa-shell" } },
  },
});
