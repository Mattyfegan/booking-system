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

// Integration tests write and delete rows, so they run against a dedicated database when TEST_DATABASE_URL is set.
// This keeps the live Riverside Barbers data (services, hours, bookings) untouched.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// Hard stop: the suite deletes rows, so it must never run against the live database.
if (!/booking_system_test/.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Refusing to run tests: DATABASE_URL does not point at booking_system_test. Set TEST_DATABASE_URL.");
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
