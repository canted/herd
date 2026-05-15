import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

async function main(): Promise<void> {
  const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString.trim().length === 0) {
    throw new Error("DIRECT_DATABASE_URL or DATABASE_URL is required to run migrations.");
  }

  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));
    const filenames = (await readdir(migrationsDir))
      .filter((filename) => filename.endsWith(".sql"))
      .sort();

    for (const filename of filenames) {
      const existing = await client.query<{ filename: string }>(
        "SELECT filename FROM schema_migrations WHERE filename = $1",
        [filename],
      );

      if (existing.rowCount !== null && existing.rowCount > 0) {
        continue;
      }

      const sql = await readFile(join(migrationsDir, filename), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
        await client.query("COMMIT");
        console.log(`Applied migration ${filename}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
