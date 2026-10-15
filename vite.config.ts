import { defineConfig, type Plugin } from "vite";

// Workers take their policy from their own response, so the solver's eval still runs there.
const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
].join("; ");

const contentSecurityPolicy: Plugin = {
  name: "content-security-policy",
  apply: "build",
  transformIndexHtml: () => [
    { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
  ],
};

export default defineConfig({
  root: "frontend",
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
  plugins: [contentSecurityPolicy],
});
