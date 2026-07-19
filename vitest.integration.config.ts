import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Integration tests need a real Postgres instance (docker compose up -d db) and
// DATABASE_URL set — kept out of the default `npm test` run so the fast unit suite
// never depends on infrastructure being up.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["**/*.integration.test.ts"],
    // All integration test files share one real Postgres instance and truncate
    // tables between tests — running files in parallel lets one file's TRUNCATE
    // wipe rows another file's in-flight test still depends on.
    fileParallelism: false,
  },
});
