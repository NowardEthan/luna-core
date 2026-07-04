import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveLunaCorePath(): string {
  const fromEnv = process.env.LUNA_CORE_PATH?.trim();
  if (fromEnv) return resolve(fromEnv);

  /** Repo luna-core: mobile-api/ fica ao lado de src/ e dist/. */
  const apiRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  return resolve(apiRoot);
}

export function resolveLunaCoreEntry(corePath: string): string {
  const entry = join(corePath, "dist", "entry-desktop.js");
  if (!existsSync(entry)) {
    throw new Error(
      `Luna Core não compilada em "${entry}". Execute: npm run build na raiz do repo.`,
    );
  }
  return entry;
}

export function isCoreBuilt(corePath: string): boolean {
  return existsSync(join(corePath, "dist", "entry-desktop.js"));
}
