import { type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ytdl = require("@distube/ytdl-core") as typeof import("@distube/ytdl-core");

const AUDIO_BUCKET = "audio";
const YOUTUBE_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/i;
const POLL_INTERVAL_MS = 8_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let processing = false;

interface AudioJob {
  id: string;
  url: string;
}

interface YtdlInfo {
  videoDetails: { title: string };
}

async function downloadYouTubeAudio(url: string): Promise<{ buffer: Buffer; title: string }> {
  return new Promise((resolve, reject) => {
    let title = "audio";

    const timer = setTimeout(() => {
      stream.destroy();
      reject(new Error("Download timed out after 60 seconds."));
    }, DOWNLOAD_TIMEOUT_MS);

    const stream = ytdl(url, { filter: "audioonly", quality: "highestaudio" });
    const chunks: Buffer[] = [];

    stream.once("info", (info: YtdlInfo) => {
      title = (info?.videoDetails?.title ?? "audio")
        .slice(0, 80)
        .replace(/[^\w\s-]/g, "")
        .trim();
    });
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => {
      clearTimeout(timer);
      resolve({ buffer: Buffer.concat(chunks), title });
    });
    stream.on("error", (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function processJob(supabase: SupabaseClient, job: AudioJob): Promise<void> {
  console.log(`[AudioJobs] Processing job ${job.id} — ${job.url}`);

  // Claim the job atomically — only proceed if we successfully moved it from pending→processing
  const { data: claimed } = await supabase
    .from("audio_jobs")
    .update({ status: "processing" })
    .eq("id", job.id)
    .eq("status", "pending")
    .select("id");

  if (!claimed || claimed.length === 0) return; // another agent already claimed it

  try {
    if (!YOUTUBE_REGEX.test(job.url)) {
      throw new Error("Only YouTube URLs are supported via the desktop agent.");
    }

    const { buffer, title } = await downloadYouTubeAudio(job.url);
    const objectPath = `${randomUUID()}-${title.replace(/\s+/g, "-")}.mp3`;

    const { error: uploadError } = await supabase.storage
      .from(AUDIO_BUCKET)
      .upload(objectPath, buffer, { contentType: "audio/mpeg", upsert: false });

    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    const { data } = supabase.storage.from(AUDIO_BUCKET).getPublicUrl(objectPath);

    await supabase
      .from("audio_jobs")
      .update({ status: "done", result_url: data.publicUrl, title })
      .eq("id", job.id);

    console.log(`[AudioJobs] Done — ${data.publicUrl}`);
  } catch (err) {
    const msg = (err as Error).message ?? "Unknown error";
    console.error(`[AudioJobs] Job ${job.id} failed:`, msg);
    await supabase
      .from("audio_jobs")
      .update({ status: "failed", error: msg })
      .eq("id", job.id);
  }
}

async function pollJobs(supabase: SupabaseClient): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    const { data, error } = await supabase
      .from("audio_jobs")
      .select("id, url")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(3);

    if (error) {
      console.warn("[AudioJobs] Poll error:", error.message);
      return;
    }

    if (!data || data.length === 0) return;

    for (const job of data as AudioJob[]) {
      await processJob(supabase, job);
    }
  } finally {
    processing = false;
  }
}

export function startAudioJobProcessor(supabase: SupabaseClient): void {
  if (pollTimer) return;
  console.log("[AudioJobs] Processor started — polling every", POLL_INTERVAL_MS / 1000, "s");
  void pollJobs(supabase);
  pollTimer = setInterval(() => void pollJobs(supabase), POLL_INTERVAL_MS);
}

export function stopAudioJobProcessor(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  processing = false;
}
