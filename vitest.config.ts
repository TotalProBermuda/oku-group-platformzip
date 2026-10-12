import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // The app uses Next's JSX transform; Vite must also compile (not preserve) JSX for rendered tests.
  oxc: { jsx: { runtime: "automatic" } },
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    globals: false,
    pool: "forks",
  },
});
