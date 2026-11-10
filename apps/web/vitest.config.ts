import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Vitest does not read .env into process.env (Next.js does), and Prisma needs DATABASE_URL for the integration tests.
// Values already set in the shell win over the file.
const envFile = fileURLToPath(new URL("./.env", import.meta.url));
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["**/__tests__/**/*.test.ts"],
    // Integration tests share one Postgres database. Run files sequentially to avoid cross-file interference.
    fileParallelism: false,
  },
});
