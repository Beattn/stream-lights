import { Router } from "express";
import { db } from "@workspace/db";
import { devicesTable, activityTable } from "@workspace/db";
import { z } from "zod";

const router = Router();

router.post("/lights/preview", async (req, res) => {
  try {
    const body = z.object({
      color: z.string(),
      brightness: z.number().int().min(0).max(100),
      durationMs: z.number().int().min(100),
      effect: z.string(),
      deviceIds: z.array(z.number()).optional(),
    }).parse(req.body);

    await db.insert(activityTable).values({
      eventType: "light_preview",
      platform: null,
      username: "manual",
      message: `Preview: ${body.effect} in ${body.color}`,
      colorTriggered: body.color,
      effectTriggered: body.effect,
    });

    req.log.info({ color: body.color, effect: body.effect, durationMs: body.durationMs }, "Light preview triggered");
    res.json({ success: true, message: `Preview triggered: ${body.effect} at ${body.color}` });
  } catch (err) {
    req.log.error({ err }, "Failed to preview light");
    res.status(400).json({ error: "Invalid light effect data" });
  }
});

export default router;
