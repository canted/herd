import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import type { PoolClient } from "pg";
import { normalizeOwnerEmail, type MaybePromise } from "./creatorStore";

const { Pool } = pg;

export interface MagicLinkRecord {
  id: string;
  email: string;
  tokenHash: string;
  returnTo: string;
  createdAt: number;
  expiresAt: number;
  usedAt: number | null;
}

export interface AuthSession {
  id: string;
  userId: string;
  email: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
}

export interface CreateMagicLinkInput {
  email: string;
  tokenHash: string;
  returnTo: string;
  expiresAt: number;
}

export interface AuthRepository {
  readonly kind: "memory" | "postgres";
  createMagicLink(input: CreateMagicLinkInput, now?: number): MaybePromise<MagicLinkRecord>;
  consumeMagicLink(tokenHash: string, now?: number): MaybePromise<MagicLinkRecord | null>;
  createSession(email: string, sessionHash: string, expiresAt: number, now?: number): MaybePromise<AuthSession>;
  getSession(sessionHash: string, now?: number): MaybePromise<AuthSession | null>;
  deleteSession(sessionHash: string): MaybePromise<void>;
  healthCheck(): MaybePromise<boolean>;
}

export class AuthStore implements AuthRepository {
  readonly kind = "memory";

  private readonly linksByTokenHash = new Map<string, MagicLinkRecord>();
  private readonly sessionsByHash = new Map<string, AuthSession>();

  createMagicLink(input: CreateMagicLinkInput, now = Date.now()): MagicLinkRecord {
    const record: MagicLinkRecord = {
      id: `magic-link-${randomUUID()}`,
      email: normalizeOwnerEmail(input.email),
      tokenHash: input.tokenHash,
      returnTo: sanitizeReturnTo(input.returnTo),
      createdAt: now,
      expiresAt: input.expiresAt,
      usedAt: null,
    };

    this.linksByTokenHash.set(record.tokenHash, record);
    return record;
  }

  consumeMagicLink(tokenHash: string, now = Date.now()): MagicLinkRecord | null {
    const record = this.linksByTokenHash.get(tokenHash);
    if (record === undefined || record.usedAt !== null || record.expiresAt <= now) {
      return null;
    }

    const consumed = { ...record, usedAt: now };
    this.linksByTokenHash.set(tokenHash, consumed);
    return consumed;
  }

  createSession(email: string, sessionHash: string, expiresAt: number, now = Date.now()): AuthSession {
    const normalized = normalizeOwnerEmail(email);
    const session: AuthSession = {
      id: `session-${randomUUID()}`,
      userId: userIdForEmail(normalized),
      email: normalized,
      createdAt: now,
      expiresAt,
      lastSeenAt: now,
    };

    this.sessionsByHash.set(sessionHash, session);
    return session;
  }

  getSession(sessionHash: string, now = Date.now()): AuthSession | null {
    const session = this.sessionsByHash.get(sessionHash);
    if (session === undefined || session.expiresAt <= now) {
      return null;
    }

    const touched = { ...session, lastSeenAt: now };
    this.sessionsByHash.set(sessionHash, touched);
    return touched;
  }

  deleteSession(sessionHash: string): void {
    this.sessionsByHash.delete(sessionHash);
  }

  healthCheck(): boolean {
    return true;
  }
}

interface MagicLinkRow {
  id: string;
  email: string;
  token_hash: string;
  return_to: string;
  created_at: Date;
  expires_at: Date;
  used_at: Date | null;
}

interface SessionRow {
  id: string;
  user_id: string;
  email: string;
  created_at: Date;
  expires_at: Date;
  last_seen_at: Date;
}

export class PostgresAuthStore implements AuthRepository {
  readonly kind = "postgres";

  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
      idleTimeoutMillis: 300_000,
      maxLifetimeSeconds: 600,
    });
  }

  async createMagicLink(input: CreateMagicLinkInput, now = Date.now()): Promise<MagicLinkRecord> {
    const email = normalizeOwnerEmail(input.email);
    const result = await this.pool.query<MagicLinkRow>(
      `
        INSERT INTO magic_link_tokens (id, email, token_hash, return_to, expires_at, created_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, email, token_hash, return_to, created_at, expires_at, used_at
      `,
      [
        `magic-link-${randomUUID()}`,
        email,
        input.tokenHash,
        sanitizeReturnTo(input.returnTo),
        new Date(input.expiresAt),
        new Date(now),
      ],
    );

    return mapMagicLinkRow(result.rows[0]!);
  }

  async consumeMagicLink(tokenHash: string, now = Date.now()): Promise<MagicLinkRecord | null> {
    const result = await this.pool.query<MagicLinkRow>(
      `
        UPDATE magic_link_tokens
        SET used_at = $2
        WHERE token_hash = $1
          AND used_at IS NULL
          AND expires_at > $2
        RETURNING id, email, token_hash, return_to, created_at, expires_at, used_at
      `,
      [tokenHash, new Date(now)],
    );

    return result.rows[0] === undefined ? null : mapMagicLinkRow(result.rows[0]);
  }

  async createSession(email: string, sessionHash: string, expiresAt: number, now = Date.now()): Promise<AuthSession> {
    const client = await this.pool.connect();
    try {
      const normalized = normalizeOwnerEmail(email);
      const userId = await ensureUser(client, normalized, now);
      const result = await client.query<SessionRow>(
        `
          INSERT INTO account_sessions (id, user_id, session_hash, expires_at, created_at, last_seen_at)
          VALUES ($1, $2, $3, $4, $5, $5)
          RETURNING id, user_id, $6::text AS email, created_at, expires_at, last_seen_at
        `,
        [
          `account-session-${randomUUID()}`,
          userId,
          sessionHash,
          new Date(expiresAt),
          new Date(now),
          normalized,
        ],
      );

      return mapSessionRow(result.rows[0]!);
    } finally {
      client.release();
    }
  }

  async getSession(sessionHash: string, now = Date.now()): Promise<AuthSession | null> {
    const result = await this.pool.query<SessionRow>(
      `
        UPDATE account_sessions s
        SET last_seen_at = $2
        FROM users u
        WHERE s.user_id = u.id
          AND s.session_hash = $1
          AND s.expires_at > $2
        RETURNING s.id, s.user_id, u.email, s.created_at, s.expires_at, s.last_seen_at
      `,
      [sessionHash, new Date(now)],
    );

    return result.rows[0] === undefined ? null : mapSessionRow(result.rows[0]);
  }

  async deleteSession(sessionHash: string): Promise<void> {
    await this.pool.query("DELETE FROM account_sessions WHERE session_hash = $1", [sessionHash]);
  }

  async healthCheck(): Promise<boolean> {
    await this.pool.query("SELECT 1");
    return true;
  }
}

export function createAuthRepository(env: NodeJS.ProcessEnv = process.env): AuthRepository {
  if (env.DATABASE_URL !== undefined && env.DATABASE_URL.trim().length > 0) {
    return new PostgresAuthStore(env.DATABASE_URL);
  }

  return new AuthStore();
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionHash(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex");
}

export function sanitizeReturnTo(value: string | undefined): string {
  if (value === undefined || value.length === 0 || !value.startsWith("/") || value.startsWith("//")) {
    return "/authoring";
  }

  return value;
}

async function ensureUser(client: PoolClient, ownerEmail: string, now: number): Promise<string> {
  const id = userIdForEmail(ownerEmail);
  const result = await client.query<{ id: string }>(
    `
      INSERT INTO users (id, email, created_at, updated_at)
      VALUES ($1, $2, $3, $3)
      ON CONFLICT (email)
      DO UPDATE SET updated_at = EXCLUDED.updated_at
      RETURNING id
    `,
    [id, ownerEmail, new Date(now)],
  );

  return result.rows[0]!.id;
}

function mapMagicLinkRow(row: MagicLinkRow): MagicLinkRecord {
  return {
    id: row.id,
    email: row.email,
    tokenHash: row.token_hash,
    returnTo: row.return_to,
    createdAt: row.created_at.getTime(),
    expiresAt: row.expires_at.getTime(),
    usedAt: row.used_at === null ? null : row.used_at.getTime(),
  };
}

function mapSessionRow(row: SessionRow): AuthSession {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    createdAt: row.created_at.getTime(),
    expiresAt: row.expires_at.getTime(),
    lastSeenAt: row.last_seen_at.getTime(),
  };
}

function userIdForEmail(ownerEmail: string): string {
  return `user-${createHash("sha256").update(ownerEmail).digest("hex").slice(0, 24)}`;
}
