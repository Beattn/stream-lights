import { pool } from "@workspace/db";

const TABLES = ["devices", "platforms", "triggers", "commands", "activity", "settings", "audio_jobs"] as const;

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
      ALTER TABLE settings
        ADD COLUMN IF NOT EXISTS overlay_config text;
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

    // -----------------------------------------------------------------------
    // RLS: enable on every table and lock down to authenticated users only.
    // The backend uses the service-role key which bypasses RLS entirely, so
    // server-side operations are unaffected.  Only direct Supabase access
    // (anon key without a valid JWT) will be rejected.
    // -----------------------------------------------------------------------
    for (const table of TABLES) {
      await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);

      // Drop the old open policy on audio_jobs (USING true) if it still exists
      if (table === "audio_jobs") {
        await client.query(`DROP POLICY IF EXISTS "audio_jobs_all" ON audio_jobs;`);
      }

      // Create an authenticated-only policy if it doesn't exist yet
      const policyName = `${table}_authenticated_all`;
      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public'
              AND tablename  = '${table}'
              AND policyname = '${policyName}'
          ) THEN
            CREATE POLICY "${policyName}" ON ${table}
              FOR ALL
              USING     (auth.role() = 'authenticated')
              WITH CHECK (auth.role() = 'authenticated');
          END IF;
        END $$;
      `);
    }

    // Storage policies for audio bucket
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'audio_insert_policy'
        ) THEN
          CREATE POLICY "audio_insert_policy" ON storage.objects
            FOR INSERT WITH CHECK (bucket_id = 'audio' AND auth.role() = 'authenticated');
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'audio_select_policy'
        ) THEN
          CREATE POLICY "audio_select_policy" ON storage.objects
            FOR SELECT USING (bucket_id = 'audio' AND auth.role() = 'authenticated');
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'audio_delete_policy'
        ) THEN
          CREATE POLICY "audio_delete_policy" ON storage.objects
            FOR DELETE USING (bucket_id = 'audio' AND auth.role() = 'authenticated');
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
