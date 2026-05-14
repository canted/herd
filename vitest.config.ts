import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@herd/composition": fileURLToPath(new URL("./packages/composition/src/index.ts", import.meta.url)),
      "@herd/protocol": fileURLToPath(new URL("./packages/protocol/src/index.ts", import.meta.url)),
      "@herd/runtime": fileURLToPath(new URL("./packages/runtime/src/index.ts", import.meta.url)),
    },
  },
});
