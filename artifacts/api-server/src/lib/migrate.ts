import { pool } from "@workspace/db";

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE triggers
        ADD COLUMN IF NOT EXISTS custom_steps text DEFAULT '[]';
    `);
    await client.query(`
      ALTER TABLE commands
        ADD COLUMN IF NOT EXISTS custom_steps text DEFAULT '[]';
    `);
    console.info("[migrate] Schema up to date");
  } catch (err) {
    console.error("[migrate] Migration failed:", err);
    throw err;
  } finally {
    client.release();
  }
}
