import { afterEach, describe, expect, it } from "vitest";

import {
  SlidingWindowCounter,
  checkRateLimit,
  rateLimitCounter,
  rateLimitedPayload,
} from "./rateLimit.js";

describe("SlidingWindowCounter", () => {
  it("aceita até o limite e barra o seguinte", () => {
    const c = new SlidingWindowCounter();
    const windowMs = 60_000;
    const t0 = 1_000_000;

    expect(c.tryConsume("k", 3, windowMs, t0).ok).toBe(true);
    expect(c.tryConsume("k", 3, windowMs, t0 + 1).ok).toBe(true);
    expect(c.tryConsume("k", 3, windowMs, t0 + 2).ok).toBe(true);

    const denied = c.tryConsume("k", 3, windowMs, t0 + 3);
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.retryAfterSec).toBeGreaterThanOrEqual(1);
      expect(denied.limit).toBe(3);
    }
  });

  it("libera de novo quando a janela escorrega", () => {
    const c = new SlidingWindowCounter();
    const windowMs = 1_000;
    const t0 = 5_000;

    expect(c.tryConsume("k", 1, windowMs, t0).ok).toBe(true);
    expect(c.tryConsume("k", 1, windowMs, t0 + 100).ok).toBe(false);
    expect(c.tryConsume("k", 1, windowMs, t0 + 1_001).ok).toBe(true);
  });

  it("chaves isoladas não compartilham contagem", () => {
    const c = new SlidingWindowCounter();
    expect(c.tryConsume("a", 1, 60_000, 0).ok).toBe(true);
    expect(c.tryConsume("b", 1, 60_000, 0).ok).toBe(true);
    expect(c.tryConsume("a", 1, 60_000, 1).ok).toBe(false);
  });
});

describe("checkRateLimit", () => {
  afterEach(() => {
    delete process.env.LUNA_RL_DISABLED;
    delete process.env.LUNA_RL_CHAT_PER_MIN;
    delete process.env.LUNA_RL_IP_PER_MIN;
    delete process.env.LUNA_RL_WINDOW_MS;
    rateLimitCounter.reset();
  });

  it("respeita LUNA_RL_DISABLED", () => {
    process.env.LUNA_RL_DISABLED = "1";
    const c = new SlidingWindowCounter();
    for (let i = 0; i < 50; i += 1) {
      expect(
        checkRateLimit({
          uid: "u1",
          ip: "1.2.3.4",
          bucket: "chat",
          now: i,
          counter: c,
        }).ok,
      ).toBe(true);
    }
  });

  it("barra por uid no bucket chat", () => {
    process.env.LUNA_RL_CHAT_PER_MIN = "2";
    process.env.LUNA_RL_IP_PER_MIN = "100";
    process.env.LUNA_RL_WINDOW_MS = "60000";
    const c = new SlidingWindowCounter();
    const base = {
      uid: "user-a",
      ip: "10.0.0.1",
      bucket: "chat" as const,
      counter: c,
    };
    expect(checkRateLimit({ ...base, now: 0 }).ok).toBe(true);
    expect(checkRateLimit({ ...base, now: 1 }).ok).toBe(true);
    const denied = checkRateLimit({ ...base, now: 2 });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.scope).toBe("uid");
  });

  it("barra por IP mesmo com uids diferentes", () => {
    process.env.LUNA_RL_CHAT_PER_MIN = "100";
    process.env.LUNA_RL_IP_PER_MIN = "2";
    process.env.LUNA_RL_WINDOW_MS = "60000";
    const c = new SlidingWindowCounter();
    expect(
      checkRateLimit({
        uid: "u1",
        ip: "9.9.9.9",
        bucket: "chat",
        now: 0,
        counter: c,
      }).ok,
    ).toBe(true);
    expect(
      checkRateLimit({
        uid: "u2",
        ip: "9.9.9.9",
        bucket: "stt",
        now: 1,
        counter: c,
      }).ok,
    ).toBe(true);
    const denied = checkRateLimit({
      uid: "u3",
      ip: "9.9.9.9",
      bucket: "vision",
      now: 2,
      counter: c,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.scope).toBe("ip");
  });

  it("payload usa code rate_limited (≠ quota_exceeded)", () => {
    const payload = rateLimitedPayload({
      ok: false,
      retryAfterSec: 7,
      limit: 40,
      windowMs: 60_000,
      scope: "uid",
    });
    expect(payload.code).toBe("rate_limited");
    expect(payload.code).not.toBe("quota_exceeded");
    expect(payload.retryAfterSec).toBe(7);
    expect(payload.error.toLowerCase()).not.toContain("plano");
  });
});
