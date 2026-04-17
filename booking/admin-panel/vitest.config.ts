import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Default to node. Component tests opt into jsdom via a per-file pragma:
    //   // @vitest-environment jsdom
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    reporters: "default",
  },
});
