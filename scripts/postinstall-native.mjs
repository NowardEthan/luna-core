#!/usr/bin/env node
/** Rebuild better-sqlite3 só em dev local — Docker/Railway usam prebuild (--ignore-scripts). */
import { execSync } from "node:child_process";

const skip =
  process.env.SKIP_SQLITE_REBUILD === "1" ||
  process.env.CI === "true" ||
  process.env.RAILWAY === "true" ||
  process.env.RAILWAY_ENVIRONMENT != null;

if (skip) {
  process.exit(0);
}

execSync("npm rebuild better-sqlite3", { stdio: "inherit" });
