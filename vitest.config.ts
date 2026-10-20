import { defineConfig } from "vitest/config";

export default defineConfig({
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
