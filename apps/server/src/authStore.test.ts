import { describe, expect, it } from "vitest";
import {
  AuthStore,
  sanitizeReturnTo,
  sessionHash,
  tokenHash,
} from "./authStore";
import {
  createSessionId,
  createSignedSessionCookie,
  readSignedSessionCookie,
} from "./authCookies";

describe("AuthStore", () => {
  it("creates one-time magic links and account sessions", () => {
    const store = new AuthStore();
    const token = "secret-token";
    const link = store.createMagicLink({
      email: "AUTHOR@Example.com",
      tokenHash: tokenHash(token),
      returnTo: "/authoring",
      expiresAt: 2000,
    }, 1000);

    expect(link.email).toBe("author@example.com");

    const consumed = store.consumeMagicLink(tokenHash(token), 1200);
    expect(consumed?.email).toBe("author@example.com");
    expect(store.consumeMagicLink(tokenHash(token), 1300)).toBeNull();

    const sessionId = createSessionId();
    const session = store.createSession(consumed!.email, sessionHash(sessionId), 3000, 1400);

    expect(store.getSession(sessionHash(sessionId), 1500)).toMatchObject({
      id: session.id,
      email: "author@example.com",
    });
    expect(store.getSession(sessionHash(sessionId), 4000)).toBeNull();
  });

  it("sanitizes return targets to same-site paths", () => {
    expect(sanitizeReturnTo("/host?code=ABC123")).toBe("/host?code=ABC123");
    expect(sanitizeReturnTo("https://example.com")).toBe("/authoring");
    expect(sanitizeReturnTo("//example.com")).toBe("/authoring");
  });
});

describe("authCookies", () => {
  it("signs and verifies session cookies", () => {
    const env = { SESSION_SECRET: "a".repeat(32) };
    const sessionId = "session-id";
    const cookie = createSignedSessionCookie(sessionId, env);
    const request = {
      headers: {
        cookie,
      },
    };

    expect(readSignedSessionCookie(request as any, env)).toEqual({
      sessionId,
      sessionHash: sessionHash(sessionId),
    });
    expect(readSignedSessionCookie(request as any, { SESSION_SECRET: "b".repeat(32) })).toBeNull();
  });
});
