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

    await client.query(`
      CREATE TABLE IF NOT EXISTS audio_jobs (
        id          text PRIMARY KEY,
        url         text NOT NULL,
        status      text NOT NULL DEFAULT 'pending',
        result_url  text,
        title       text,
        error       text,
        created_at  timestamptz NOT NULL DEFAULT now()
      );
    `);

    // Clean up stale jobs older than 24 hours
    await client.query(`
      DELETE FROM audio_jobs
      WHERE created_at < now() - INTERVAL '24 hours';
    `);

    // Ensure RLS is enabled and permissive so the desktop agent (anon + user JWT)
    // can read and update jobs.
    await client.query(`ALTER TABLE audio_jobs ENABLE ROW LEVEL SECURITY;`);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'public' AND tablename = 'audio_jobs' AND policyname = 'audio_jobs_all'
        ) THEN
          CREATE POLICY "audio_jobs_all" ON audio_jobs FOR ALL USING (true) WITH CHECK (true);
        END IF;
      END $$;
    `);

    // Storage policies for audio bucket (belt-and-suspenders alongside the explicit JWT header)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'audio_insert_policy'
        ) THEN
          CREATE POLICY "audio_insert_policy" ON storage.objects
            FOR INSERT WITH CHECK (bucket_id = 'audio');
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'audio_select_policy'
        ) THEN
          CREATE POLICY "audio_select_policy" ON storage.objects
            FOR SELECT USING (bucket_id = 'audio');
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'audio_delete_policy'
        ) THEN
          CREATE POLICY "audio_delete_policy" ON storage.objects
            FOR DELETE USING (bucket_id = 'audio');
        END IF;
      END $$;
    `);

    console.info("[migrate] Schema up to date");
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (msg.includes("storage") || msg.includes("permission denied")) {
      console.warn("[migrate] Could not create storage policies (insufficient DB permissions) — skipping:", msg);
    } else {
      console.error("[migrate] Migration failed:", err);
      throw err;
    }
  } finally {
    client.release();
  }
}
