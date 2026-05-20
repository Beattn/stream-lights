import { Router, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const ALLOWED_TYPES = new Set([
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/ogg",
  "audio/aac", "audio/flac", "audio/x-flac", "audio/webm", "audio/mp4",
]);

const EXT_MAP: Record<string, string> = {
  "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav",
  "audio/wave": "wav", "audio/ogg": "ogg", "audio/aac": "aac",
  "audio/flac": "flac", "audio/x-flac": "flac", "audio/webm": "webm",
  "audio/mp4": "m4a",
};

const AUDIO_BUCKET = process.env.SUPABASE_AUDIO_BUCKET ?? "audio";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Storage not configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function ensureBucket(supabase: ReturnType<typeof createClient>) {
  const { error } = await supabase.storage.createBucket(AUDIO_BUCKET, { public: true });
  if (error && !error.message.includes("already exists") && !error.message.includes("Duplicate")) {
    throw new Error(`Could not create storage bucket "${AUDIO_BUCKET}": ${error.message}. Create a public bucket named "${AUDIO_BUCKET}" in your Supabase Storage dashboard.`);
  }
}

router.post(
  "/audio/upload",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const mimeType = file.mimetype || "audio/mpeg";
    if (!ALLOWED_TYPES.has(mimeType)) {
      res.status(400).json({ error: "File type not allowed. Upload an audio file (.mp3, .wav, .ogg, etc.)" });
      return;
    }

    try {
      const supabase = getSupabase();
      await ensureBucket(supabase);

      const ext = EXT_MAP[mimeType] ?? "mp3";
      const objectPath = `${randomUUID()}.${ext}`;

      const { error } = await supabase.storage
        .from(AUDIO_BUCKET)
        .upload(objectPath, file.buffer, { contentType: mimeType, upsert: false });

      if (error) throw new Error(error.message);

      const { data } = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(objectPath);
      res.json({ url: data.publicUrl });
    } catch (err) {
      req.log.error({ err }, "Audio upload failed");
      res.status(500).json({ error: (err as Error).message ?? "Upload failed" });
    }
  }
);

export default router;
