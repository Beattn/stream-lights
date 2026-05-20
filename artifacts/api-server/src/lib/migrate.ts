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

    // Ensure storage policies exist so the service role key can upload files
    // even if the Supabase project has RLS enabled on storage.objects.
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
    // Storage schema may not be accessible via the app DB user — that's OK,
    // the explicit Authorization header on the Supabase client handles it.
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
