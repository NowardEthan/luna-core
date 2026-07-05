import { describe, expect, it } from "vitest";
import { ehCriadorVerificado } from "../src/interlocutor/ehCriadorVerificado.js";
import { UID_CRIADOR_CANONICO } from "../src/interlocutor/esquemaInterlocutor.js";
import { resolverInterlocutorId } from "../src/interlocutor/resolverInterlocutorId.js";

describe("interlocutor — criador verificado", () => {
  it("UID canónico Ethan é criador", () => {
    expect(ehCriadorVerificado(UID_CRIADOR_CANONICO)).toBe(true);
  });

  it("outro UID não é criador", () => {
    expect(ehCriadorVerificado("outro-uid-qualquer")).toBe(false);
  });

  it("null/undefined não é criador", () => {
    expect(ehCriadorVerificado(null)).toBe(false);
    expect(ehCriadorVerificado(undefined)).toBe(false);
  });
});

describe("interlocutor — resolver id", () => {
  it("com uid Firebase devolve o uid", () => {
    expect(resolverInterlocutorId("firebase-abc", "sess-1")).toBe("firebase-abc");
  });

  it("sem uid gera anon estável por sessão", () => {
    const a = resolverInterlocutorId(null, "sess-x");
    const b = resolverInterlocutorId(null, "sess-x");
    const c = resolverInterlocutorId(null, "sess-y");
    expect(a).toMatch(/^anon:/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
