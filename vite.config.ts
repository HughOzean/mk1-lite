import { defineConfig } from "vite";
export default defineConfig({
  clearScreen: false,
  base: "./",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/")) {
            if (
              /\/(?:@codemirror|@lezer|style-mod|w3c-keyname|crelt)\//.test(id)
            )
              return "editor";
            if (
              /\/(?:markdown-it|linkify-it|uc\.micro|mdurl|punycode\.js|entities|argparse)\//.test(
                id,
              )
            )
              return "markdown";
          }
        },
      },
    },
  },
});
