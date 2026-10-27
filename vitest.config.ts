import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./packages/frontend/src", import.meta.url)) } },
  test: {
    env: {
      TOKEN_PEPPER: "test-token-pepper",
    },
    include: [
      "scripts/toolingSecurity.test.ts",
      "scripts/buildToolingSecurity.test.ts",
      "scripts/cssToolingSecurity.test.ts",
      "convex/lib/__tests__/**/*.test.ts",
      "packages/frontend/src/**/*.test.ts",
    ],
  },
});
