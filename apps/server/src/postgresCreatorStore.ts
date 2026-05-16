import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import type { PoolClient } from "pg";
import type {
  CompositionRecord,
  ConfirmPackageUploadInput,
  CreatorRepository,
  CreatePackageInput,
  PackageRecord,
  SaveCompositionInput,
} from "./creatorStore";
import { normalizeOwnerEmail } from "./creatorStore";
import { buildPackageObjectKey } from "./packageStorage";

const { Pool } = pg;

interface CompositionRow {
  id: string;
  email: string;
  composition_id: string;
  name: string;
  document: unknown;
  created_at: Date;
  updated_at: Date;
}

interface PackageRow {
  id: string;
  email: string;
  composition_record_id: string;
  composition_id: string;
  name: string;
  version: number;
  tigris_object_key: string;
  status: "pendingUpload" | "ready";
  content_type: string | null;
  size_bytes: number | null;
  sha256: string | null;
  upload_confirmed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class PostgresCreatorStore implements CreatorRepository {
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

  async saveComposition(input: SaveCompositionInput, now = Date.now()): Promise<CompositionRecord> {
    const client = await this.pool.connect();
    try {
      const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
      const ownerUserId = await ensureUser(client, ownerEmail, now);
      return saveCompositionWithClient(client, ownerUserId, ownerEmail, input, now);
    } finally {
      client.release();
    }
  }

  async listCompositions(ownerEmail: string): Promise<CompositionRecord[]> {
    const normalized = normalizeOwnerEmail(ownerEmail);
    const result = await this.pool.query<CompositionRow>(
      `
        SELECT c.id, u.email, c.composition_id, c.name, c.document, c.created_at, c.updated_at
        FROM compositions c
        JOIN users u ON u.id = c.owner_user_id
        WHERE u.email = $1
        ORDER BY c.updated_at DESC
      `,
      [normalized],
    );

    return result.rows.map(mapCompositionRow);
  }

  async createPackage(input: CreatePackageInput, now = Date.now()): Promise<PackageRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
      const ownerUserId = await ensureUser(client, ownerEmail, now);
      const composition = await saveCompositionWithClient(client, ownerUserId, ownerEmail, input, now);
      const versionResult = await client.query<{ next_version: number }>(
        `
          SELECT COALESCE(MAX(version), 0) + 1 AS next_version
          FROM packages
          WHERE composition_record_id = $1
        `,
        [composition.id],
      );
      const version = versionResult.rows[0]?.next_version ?? 1;
      const id = `package-${randomUUID()}`;
      const objectKey = buildPackageObjectKey({
        ownerEmail,
        packageId: id,
        version,
        ...(input.filename === undefined ? {} : { filename: input.filename }),
      });
      const result = await client.query<PackageRow>(
        `
          INSERT INTO packages (
            id,
            owner_user_id,
            composition_record_id,
            composition_id,
            name,
            version,
            tigris_object_key,
            status,
            content_type,
            size_bytes,
            sha256,
            upload_confirmed_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, 'pendingUpload', $8, $8)
          RETURNING
            id,
            $9::text AS email,
            composition_record_id,
            composition_id,
            name,
            version,
            tigris_object_key,
            status,
            created_at,
            updated_at
        `,
        [
          id,
          ownerUserId,
          composition.id,
          composition.compositionId,
          composition.name,
          version,
          objectKey,
          new Date(now),
          ownerEmail,
        ],
      );
      await client.query("COMMIT");

      return mapPackageRow(result.rows[0]!);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listPackages(ownerEmail: string): Promise<PackageRecord[]> {
    const normalized = normalizeOwnerEmail(ownerEmail);
    const result = await this.pool.query<PackageRow>(
      `
        SELECT
          p.id,
          u.email,
          p.composition_record_id,
          p.composition_id,
          p.name,
          p.version,
          p.tigris_object_key,
          p.status,
          p.content_type,
          p.size_bytes,
          p.sha256,
          p.upload_confirmed_at,
          p.created_at,
          p.updated_at
        FROM packages p
        JOIN users u ON u.id = p.owner_user_id
        WHERE u.email = $1
        ORDER BY p.updated_at DESC
      `,
      [normalized],
    );

    return result.rows.map(mapPackageRow);
  }

  async getPackage(ownerEmail: string, packageId: string): Promise<PackageRecord | null> {
    const normalized = normalizeOwnerEmail(ownerEmail);
    const result = await this.pool.query<PackageRow>(
      `
        SELECT
          p.id,
          u.email,
          p.composition_record_id,
          p.composition_id,
          p.name,
          p.version,
          p.tigris_object_key,
          p.status,
          p.content_type,
          p.size_bytes,
          p.sha256,
          p.upload_confirmed_at,
          p.created_at,
          p.updated_at
        FROM packages p
        JOIN users u ON u.id = p.owner_user_id
        WHERE u.email = $1 AND p.id = $2
      `,
      [normalized, packageId],
    );

    return result.rows[0] === undefined ? null : mapPackageRow(result.rows[0]);
  }

  async confirmPackageUpload(input: ConfirmPackageUploadInput, now = Date.now()): Promise<PackageRecord> {
    const ownerEmail = normalizeOwnerEmail(input.ownerEmail);
    const result = await this.pool.query<PackageRow>(
      `
        UPDATE packages p
        SET
          status = 'ready',
          content_type = $3,
          size_bytes = $4,
          sha256 = $5,
          upload_confirmed_at = $6,
          updated_at = $6
        FROM users u
        WHERE p.owner_user_id = u.id
          AND u.email = $1
          AND p.id = $2
        RETURNING
          p.id,
          u.email,
          p.composition_record_id,
          p.composition_id,
          p.name,
          p.version,
          p.tigris_object_key,
          p.status,
          p.content_type,
          p.size_bytes,
          p.sha256,
          p.upload_confirmed_at,
          p.created_at,
          p.updated_at
      `,
      [
        ownerEmail,
        input.packageId,
        input.contentType,
        input.sizeBytes,
        input.sha256,
        new Date(now),
      ],
    );

    if (result.rows[0] === undefined) {
      throw new Error(`Package "${input.packageId}" was not found.`);
    }

    return mapPackageRow(result.rows[0]);
  }
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

async function saveCompositionWithClient(
  client: PoolClient,
  ownerUserId: string,
  ownerEmail: string,
  input: SaveCompositionInput,
  now: number,
): Promise<CompositionRecord> {
  const id = compositionRecordId(ownerEmail, input.composition.id);
  const result = await client.query<CompositionRow>(
    `
      INSERT INTO compositions (
        id,
        owner_user_id,
        composition_id,
        name,
        document,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $6)
      ON CONFLICT (owner_user_id, composition_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        document = EXCLUDED.document,
        updated_at = EXCLUDED.updated_at
      RETURNING
        id,
        $7::text AS email,
        composition_id,
        name,
        document,
        created_at,
        updated_at
    `,
    [
      id,
      ownerUserId,
      input.composition.id,
      input.composition.name,
      JSON.stringify(input.composition),
      new Date(now),
      ownerEmail,
    ],
  );

  return mapCompositionRow(result.rows[0]!);
}

function mapCompositionRow(row: CompositionRow): CompositionRecord {
  return {
    id: row.id,
    ownerEmail: row.email,
    compositionId: row.composition_id,
    name: row.name,
    composition: row.document as CompositionRecord["composition"],
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime(),
  };
}

function mapPackageRow(row: PackageRow): PackageRecord {
  const record: PackageRecord = {
    id: row.id,
    ownerEmail: row.email,
    compositionRecordId: row.composition_record_id,
    compositionId: row.composition_id,
    name: row.name,
    version: row.version,
    objectKey: row.tigris_object_key,
    status: row.status,
    createdAt: row.created_at.getTime(),
    updatedAt: row.updated_at.getTime(),
  };

  if (row.content_type !== null) record.contentType = row.content_type;
  if (row.size_bytes !== null) record.sizeBytes = Number(row.size_bytes);
  if (row.sha256 !== null) record.sha256 = row.sha256;
  if (row.upload_confirmed_at !== null) record.uploadConfirmedAt = row.upload_confirmed_at.getTime();

  return record;
}

function userIdForEmail(ownerEmail: string): string {
  return `user-${hash(ownerEmail)}`;
}

function compositionRecordId(ownerEmail: string, compositionId: string): string {
  return `composition-record-${hash(`${ownerEmail}:${compositionId}`)}`;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}
