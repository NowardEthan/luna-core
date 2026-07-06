import { describe, expect, it } from "vitest";

/** Espelha orbit-mobile/src/lib/chatMessageIds.ts */
function lunaMessageIdForUser(userMessageId: string): string {
  if (userMessageId.startsWith("u")) {
    return `l${userMessageId.slice(1)}`;
  }
  return `l-${userMessageId}`;
}

describe("pares de id de mensagem (idempotência chat)", () => {
  it("deriva lunaMessageId estável a partir do userMessageId", () => {
    expect(lunaMessageIdForUser("u1738-abc")).toBe("l1738-abc");
    expect(lunaMessageIdForUser("u1738-abc")).toBe(lunaMessageIdForUser("u1738-abc"));
  });

  it("fallback quando id não começa com u", () => {
    expect(lunaMessageIdForUser("msg-1")).toBe("l-msg-1");
  });
});
