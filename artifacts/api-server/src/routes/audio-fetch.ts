import { Router, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { db, audioJobsTable } from "@workspace/db";
import { writeLimiter } from "../middlewares/rate-limit";

const router = Router();

const YOUTUBE_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/i;
const Body = z.object({ url: z.string().url() });

const SSRF_BLOCK = /^(localhost|127\.|0\.0\.0\.0|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1|fd[0-9a-f]{2}:)/i;

function isSafeUrl(raw: string): boolean {
  try {
    const { hostname } = new URL(raw);
    return !SSRF_BLOCK.test(hostname);
  } catch {
    return false;
  }
}
const AUDIO_BUCKET = process.env.SUPABASE_AUDIO_BUCKET ?? "audio";
const DOWNLOAD_TIMEOUT_MS = 25_000;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Storage not configured (missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${key}` } },
  });
}

async function ensureBucket(supabase: ReturnType<typeof createClient>) {
  const { error } = await supabase.storage.createBucket(AUDIO_BUCKET, { public: true });
  if (
    error &&
    !error.message.includes("already exists") &&
    !error.message.includes("Duplicate") &&
    !error.message.includes("row-level security") &&
    !error.message.includes("violates")
  ) {
    throw new Error(`Could not create storage bucket "${AUDIO_BUCKET}": ${error.message}`);
  }
}

router.post("/audio/fetch", writeLimiter, async (req: Request, res: Response) => {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid URL is required." });
    return;
  }

  const { url } = parsed.data;

  if (!isSafeUrl(url)) {
    res.status(400).json({ error: "URL is not allowed." });
    return;
  }

  // ── YouTube: delegate to desktop agent via job queue ────────────────────
  if (YOUTUBE_REGEX.test(url)) {
    try {
      const jobId = randomUUID();
      await db.insert(audioJobsTable).values({ id: jobId, url, status: "pending" });
      res.json({ jobId });
    } catch (err) {
      req.log.error({ err }, "Failed to create audio job");
      res.status(500).json({ error: "Failed to queue download. Make sure the desktop agent is running." });
    }
    return;
  }

  // ── Generic HTTP audio URL: download & re-host on server ────────────────
  try {
    const supabase = getSupabase();
    await ensureBucket(supabase);

    const fetchRes = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StreamLights/1.0)" },
      redirect: "follow",
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });

    if (!fetchRes.ok) {
      res.status(400).json({ error: `Could not fetch the URL (HTTP ${fetchRes.status}).` });
      return;
    }

    const contentType = fetchRes.headers.get("content-type") ?? "audio/mpeg";
    if (!contentType.startsWith("audio/") && !contentType.startsWith("video/")) {
      res.status(400).json({ error: "The URL does not point to an audio file. For streaming platforms, only YouTube links are supported." });
      return;
    }

    const extMap: Record<string, string> = {
      "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav",
      "audio/ogg": "ogg", "audio/aac": "aac", "audio/flac": "flac",
      "audio/webm": "webm", "audio/mp4": "m4a", "video/webm": "webm",
    };
    const ext = extMap[contentType.split(";")[0].trim()] ?? "mp3";
    const objectPath = `${randomUUID()}.${ext}`;
    const buffer = Buffer.from(await fetchRes.arrayBuffer());

    const { error } = await supabase.storage
      .from(AUDIO_BUCKET)
      .upload(objectPath, buffer, { contentType, upsert: false });

    if (error) throw new Error(error.message);

    const { data } = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(objectPath);
    res.json({ url: data.publicUrl });
  } catch (err) {
    req.log.error({ err }, "Audio fetch failed");
    const msg = (err as Error).message ?? "";
    if (msg.includes("timed out")) {
      res.status(504).json({ error: msg });
    } else {
      res.status(500).json({ error: msg || "Failed to fetch audio." });
    }
  }
});

export default router;
