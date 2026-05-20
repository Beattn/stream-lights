import { Router, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { objectStorageClient } from "../lib/objectStorage";
import ytdl from "@distube/ytdl-core";
import { z } from "zod";
import { writeLimiter } from "../middlewares/rate-limit";

const router = Router();

const YOUTUBE_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)/i;

const Body = z.object({ url: z.string().url() });

router.post("/audio/fetch", writeLimiter, async (req: Request, res: Response) => {
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A valid URL is required." });
    return;
  }

  const { url } = parsed.data;
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    res.status(500).json({ error: "Storage not configured." });
    return;
  }

  const bucket = objectStorageClient.bucket(bucketId);

  try {
    if (YOUTUBE_REGEX.test(url)) {
      // ── YouTube: extract best audio-only stream ──────────────────────
      if (!ytdl.validateURL(url)) {
        res.status(400).json({ error: "Invalid YouTube URL." });
        return;
      }

      const info = await ytdl.getInfo(url);
      const title = info.videoDetails.title.slice(0, 80).replace(/[^\w\s-]/g, "").trim();
      const objectName = `audio/${randomUUID()}-${title.replace(/\s+/g, "-")}.mp3`;
      const gcsFile = bucket.file(objectName);

      await new Promise<void>((resolve, reject) => {
        const stream = ytdl(url, {
          filter: "audioonly",
          quality: "highestaudio",
        });
        const writeStream = gcsFile.createWriteStream({
          contentType: "audio/mpeg",
          metadata: { originalUrl: url, title },
        });
        stream.pipe(writeStream);
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
        stream.on("error", reject);
      });

      const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol ?? "https";
      const host = (req.headers["x-forwarded-host"] as string) ?? (req.headers.host as string) ?? "";
      const serveUrl = `${proto}://${host}/api/storage/objects/${objectName}`;

      res.json({ url: serveUrl, title });
      return;
    }

    // ── Generic HTTP audio URL: download & re-host ──────────────────────
    const fetchRes = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StreamLights/1.0)" },
      redirect: "follow",
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
    const objectName = `audio/${randomUUID()}.${ext}`;
    const gcsFile = bucket.file(objectName);

    const arrayBuffer = await fetchRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await gcsFile.save(buffer, {
      contentType,
      metadata: { originalUrl: url },
    });

    const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol ?? "https";
    const host = (req.headers["x-forwarded-host"] as string) ?? (req.headers.host as string) ?? "";
    const serveUrl = `${proto}://${host}/api/storage/objects/${objectName}`;

    res.json({ url: serveUrl });
  } catch (err) {
    req.log.error({ err }, "Audio fetch failed");
    const msg = (err as Error).message ?? "";
    if (msg.includes("private") || msg.includes("age-restricted") || msg.includes("unavailable")) {
      res.status(400).json({ error: `Can't access this video: ${msg}` });
    } else {
      res.status(500).json({ error: "Failed to fetch audio. The video may be private, age-restricted, or unavailable." });
    }
  }
});

export default router;
