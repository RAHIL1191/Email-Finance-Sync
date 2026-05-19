// Force-load .env file BEFORE any module imports, overriding inherited env vars.
// This prevents stale system-level DATABASE_URL from interfering.
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const envFile = resolve(import.meta.dirname, ".env");
if (existsSync(envFile)) {
  const content = readFileSync(envFile, "utf8");
  for (const line of content.split("\n")) {
    const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

await import("./dist/index.mjs");
