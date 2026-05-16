import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { sessionHash } from "./authStore";

export const sessionCookieName = "herd_session";
export const sessionTtlMs = 1000 * 60 * 60 * 24 * 30;
export const magicLinkTtlMs = 1000 * 60 * 15;

export interface ParsedSessionCookie {
  sessionId: string;
  sessionHash: string;
}

export function createSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export function createSignedSessionCookie(
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const maxAge = Math.floor(sessionTtlMs / 1000);
  const secure = env.NODE_ENV === "production" ? "; Secure" : "";
  const value = `${sessionId}.${sign(sessionId, getSessionSecret(env))}`;
  return `${sessionCookieName}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

export function createClearedSessionCookie(env: NodeJS.ProcessEnv = process.env): string {
  const secure = env.NODE_ENV === "production" ? "; Secure" : "";
  return `${sessionCookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

export function readSignedSessionCookie(
  request: IncomingMessage,
  env: NodeJS.ProcessEnv = process.env,
): ParsedSessionCookie | null {
  const rawValue = parseCookies(request.headers.cookie ?? "")[sessionCookieName];
  if (rawValue === undefined) {
    return null;
  }

  const [sessionId, signature] = rawValue.split(".");
  if (sessionId === undefined || signature === undefined || sessionId.length === 0) {
    return null;
  }

  if (!verify(sessionId, signature, getSessionSecret(env))) {
    return null;
  }

  return {
    sessionId,
    sessionHash: sessionHash(sessionId),
  };
}

export function isSessionSecretConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SESSION_SECRET !== undefined && env.SESSION_SECRET.length >= 32;
}

function getSessionSecret(env: NodeJS.ProcessEnv): string {
  if (env.SESSION_SECRET !== undefined && env.SESSION_SECRET.length > 0) {
    return env.SESSION_SECRET;
  }

  if (env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production.");
  }

  return "development-session-secret-do-not-use-in-production";
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function verify(value: string, signature: string, secret: string): boolean {
  const expected = sign(value, secret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function parseCookies(header: string): Record<string, string> {
  const output: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === undefined || rawName.length === 0) continue;
    output[rawName] = rawValue.join("=");
  }
  return output;
}
