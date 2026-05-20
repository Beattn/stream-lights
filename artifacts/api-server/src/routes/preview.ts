import { Router } from "express";
import { z } from "zod";
import { hexColorSchema, effectSchema } from "../lib/security";
import { alertQueue } from "../lib/drivers/alert-queue";
import { requireAuth } from "../middlewares/auth";
import { writeLimiter } from "../middlewares/rate-limit";

const router = Router();

const stepSchema = z.object({
  color: hexColorSchema,
  durationMs: z.number().int().min(50).max(30_000),
  brightness: z.number().int().min(1).max(100).optional(),
  effect: z.string().max(32).optional(),
  movementParams: z.object({
    speedMs: z.number().int().min(50).max(10_000).optional(),
    minBrightness: z.number().int().min(0).max(100).optional(),
    waveform: z.enum(["sine", "linear", "sharp"]).optional(),
  }).optional(),
});

router.post("/preview-effect", requireAuth, writeLimiter, async (req, res) => {
  try {
    const body = z.object({
      color: hexColorSchema,
      brightness: z.number().int().min(1).max(100),
      effect: effectSchema,
      durationMs: z.number().int().min(50).max(60_000),
      customSteps: z.array(stepSchema).max(64).optional(),
      deviceIds: z.array(z.number().int().positive()).max(50).optional(),
    }).parse(req.body);

    const enqueued = alertQueue.enqueue(
      {
        color: body.color,
        brightness: body.brightness,
        effect: body.effect,
        durationMs: body.durationMs,
        ...(body.customSteps && body.customSteps.length > 0 ? { customSteps: body.customSteps } : {}),
      },
      {
        eventType: "preview",
        deviceIds: body.deviceIds,
        returnToIdle: true,
      }
    );

    if (!enqueued) {
      return res.status(429).json({ error: "Light busy — try again in a moment" });
    }

    req.log.info("Preview effect fired");
    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to fire preview effect");
    res.status(400).json({ error: "Invalid effect params" });
  }
});

export default router;
