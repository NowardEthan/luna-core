import { createHash } from "node:crypto";

/** UID Firebase ou hash anónimo estável por sessão (CLI/Storybook). */
export function resolverInterlocutorId(
  uid: string | null | undefined,
  sessionId: string,
): string {
  if (uid) return uid;
  const salt = process.env.LUNA_ANON_SALT ?? "luna-anon-dev";
  const hash = createHash("sha256").update(`${sessionId}:${salt}`).digest("hex").slice(0, 16);
  return `anon:${hash}`;
}
