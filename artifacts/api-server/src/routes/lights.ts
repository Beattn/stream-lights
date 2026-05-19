import { Router } from "express";
import { db } from "@workspace/db";
import { activityTable } from "@workspace/db";
import { z } from "zod";
import { hexColorSchema, effectSchema } from "../lib/security";
import { writeLimiter } from "../middlewares/rate-limit";

const router = Router();

router.post("/lights/preview", writeLimiter, async (req, res) => {
  try {
    const body = z.object({
      color: hexColorSchema,
      brightness: z.number().int().min(0).max(100),
      durationMs: z.number().int().min(100).max(30_000),
      effect: effectSchema,
    }).strict().parse(req.body);

    await db.insert(activityTable).values({
      eventType: "light_preview",
      platform: null,
      username: "manual",
      message: `Preview: ${body.effect} in ${body.color}`,
      colorTriggered: body.color,
      effectTriggered: body.effect,
    });

    req.log.info({ effect: body.effect, durationMs: body.durationMs }, "Light preview triggered");
    res.json({ success: true, message: `Preview triggered: ${body.effect} at ${body.color}` });
  } catch (err) {
    req.log.error({ err }, "Failed to preview light");
    res.status(400).json({ error: "Invalid light effect data" });
  }
});

export default router;
