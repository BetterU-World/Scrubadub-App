import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      TOKEN_PEPPER: "test-token-pepper",
    },
    include: ["convex/lib/__tests__/**/*.test.ts"],
  },
});
