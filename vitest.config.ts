import path from "node:path";

import { defineConfig } from "vitest/config";

/**
 * Unit/integration tests. Integration tests that touch PostgreSQL must point DATABASE_URL at an
 * isolated database cloned from the schema template, e.g.:
 *   $env:DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5433/vsg_test_jobs'; npx vitest run src/modules/jobs
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // server-only throws outside the react-server condition; tests run plain Node.
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
    exclude: ["node_modules", ".next", "e2e"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
  },
});
