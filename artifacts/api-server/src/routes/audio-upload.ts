import { Router, type Request, type Response } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { objectStorageClient } from "../lib/objectStorage";

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

    const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
    if (!bucketId) {
      res.status(500).json({ error: "Storage not configured" });
      return;
    }

    try {
      const ext = EXT_MAP[mimeType] ?? "mp3";
      const objectName = `audio/${randomUUID()}.${ext}`;

      const bucket = objectStorageClient.bucket(bucketId);
      const gcsFile = bucket.file(objectName);

      await gcsFile.save(file.buffer, {
        contentType: mimeType,
        metadata: { originalName: file.originalname },
      });

      // Build the public serve URL using the request host
      const proto = req.headers["x-forwarded-proto"] ?? req.protocol ?? "https";
      const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
      const base = `${proto}://${host}`;
      const serveUrl = `${base}/api/storage/objects/${objectName}`;

      res.json({ url: serveUrl });
    } catch (err) {
      req.log.error({ err }, "Audio upload failed");
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

export default router;
