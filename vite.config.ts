import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 60 * 1000,
    coverage: {
      provider: "v8",
      exclude: [".pnp.cjs", ".pnp.loader.mjs"],
    },
  },
});
