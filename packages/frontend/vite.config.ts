import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { giveawayHtml } from "./build/giveawayMetadata";

export default defineConfig({
  plugins: [react(), {
    name: "giveaway-social-metadata",
    enforce: "post",
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const index = bundle["index.html"];
        if (index?.type !== "asset" || typeof index.source !== "string") throw new Error("Missing HTML for giveaway metadata");
        this.emitFile({ type: "asset", fileName: "giveaway/index.html", source: giveawayHtml(index.source) });
      },
    },
  }],
  envDir: path.resolve(__dirname, "../.."),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
