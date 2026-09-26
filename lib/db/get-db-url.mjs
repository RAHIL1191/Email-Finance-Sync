import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

/**
 * Resolves the DATABASE_URL environment variable.
 * Fallbacks to checking .env files in standard locations without hardcoding credentials in code.
 */
export function getDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const candidatePaths = [
    ".env",
    "../.env",
    "../../.env",
    "artifacts/api-server/.env",
    "../artifacts/api-server/.env",
    "../../artifacts/api-server/.env",
  ];

  for (const rel of candidatePaths) {
    const fullPath = resolve(rel);
    if (existsSync(fullPath)) {
      try {
        const content = readFileSync(fullPath, "utf-8");
        const match = content.match(/^DATABASE_URL\s*=\s*['"]?([^'"\r\n]+)['"]?/m);
        if (match && match[1]) {
          return match[1].trim();
        }
      } catch {
        // continue
      }
    }
  }

  return null;
}
