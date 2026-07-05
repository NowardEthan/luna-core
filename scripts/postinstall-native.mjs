#!/usr/bin/env node
/**
 * Dev local: rebuild better-sqlite3 (compila nativo).
 * Docker/Railway: npm ci --ignore-scripts + rebuild sharp e better-sqlite3 no Dockerfile.
 */
import { execSync } from "node:child_process";

const skipSqlite =
  process.env.SKIP_SQLITE_REBUILD === "1" ||
  process.env.CI === "true" ||
  process.env.RAILWAY === "true" ||
  process.env.RAILWAY_ENVIRONMENT != null;

if (!skipSqlite) {
  execSync("npm rebuild better-sqlite3", { stdio: "inherit" });
}

// sharp precisa do binário da plataforma actual (@xenova/transformers)
execSync("npm rebuild sharp --foreground-scripts", { stdio: "inherit" });
