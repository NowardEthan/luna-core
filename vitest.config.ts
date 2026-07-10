import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Isola o DB SQLite por worker (não polui o memoria.db real; mata o flake de
    // workers paralelos no mesmo arquivo). Ver vitest.setup.ts.
    setupFiles: ["./vitest.setup.ts"],
  },
});
