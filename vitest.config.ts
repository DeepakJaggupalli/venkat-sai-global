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
    exclude: ["node_modules", ".next", "e2e"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
    // Integration tests share one test database per run, so their files run one at a time (no two files writing at
    // once). Unit tests stay fully parallel. `include` lives in each project: with `extends`, arrays are merged.
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"], exclude: ["src/**/*.integration.test.ts"] },
      },
      { extends: true, test: { name: "integration", include: ["src/**/*.integration.test.ts"], fileParallelism: false } },
    ],
  },
});
