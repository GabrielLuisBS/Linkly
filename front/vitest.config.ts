import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./vitest.setup.ts"],
      // Junto do código que testam, igual ao back — ver back/vitest.config.ts.
      include: ["src/**/*.test.{ts,tsx}"],
    },
  }),
);
