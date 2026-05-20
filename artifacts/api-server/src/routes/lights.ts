import { Router } from "express";
import { z } from "zod";
import { hexColorSchema, effectSchema } from "../lib/security.js";
import { alertQueue } from "../lib/alert-queue.js";
import { returnToIdle } from "../lib/light-engine.js";
import { writeLimiter } from "../middlewares/rate-limit.js";
import { db } from "@workspace/db";
import { activityTable } from "@workspace/db";

const router = Router();

router.post("/lights/preview", writeLimiter, async (req, res) => {
  try {
    const body = z.object({
      color: hexColorSchema,
      brightness: z.number().int().min(0).max(100),
      durationMs: z.number().int().min(100).max(30_000),
      effect: effectSchema,
      deviceIds: z.array(z.number().int().min(1)).max(50).optional(),
    }).strict().parse(req.body);

    alertQueue.enqueue(
      { color: body.color, brightness: body.brightness, effect: body.effect, durationMs: body.durationMs },
      { deviceIds: body.deviceIds, returnToIdle: true, eventType: "light_preview", username: "manual" }
    );

    await db.insert(activityTable).values({
      eventType: "light_preview",
      platform: null,
      username: "manual",
      message: `Preview: ${body.effect} in ${body.color}`,
      colorTriggered: body.color,
      effectTriggered: body.effect,
    });

    req.log.info({ effect: body.effect }, "Light preview triggered");
    res.json({ success: true, message: `Preview triggered: ${body.effect} at ${body.color}` });
  } catch (err) {
    req.log.error({ err }, "Failed to preview light");
    res.status(400).json({ error: "Invalid light effect data" });
  }
});

router.post("/lights/idle", writeLimiter, async (req, res) => {
  try {
    const body = z.object({
      deviceIds: z.array(z.number().int().min(1)).max(50).optional(),
    }).parse(req.body ?? {});

    await returnToIdle(body.deviceIds);
    res.json({ success: true, message: "Returned to idle" });
  } catch (err) {
    req.log.error({ err }, "Failed to return to idle");
    res.status(500).json({ error: "Failed to return to idle" });
  }
});

router.get("/lights/queue", (_req, res) => {
  res.json({ queueLength: alertQueue.length });
});

router.post("/lights/queue/clear", writeLimiter, (_req, res) => {
  alertQueue.clear();
  res.json({ success: true, message: "Alert queue cleared" });
});

const sseClients = new Set<ReturnType<typeof setTimeout> extends never ? never : NodeJS.Timeout extends never ? never : import("express").Response>();

router.get("/lights/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write("data: {\"type\":\"connected\"}\n\n");

  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 20_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res as never);
  });

  sseClients.add(res as never);
});

export function broadcastSSE(event: object): void {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try { (client as unknown as import("express").Response).write(data); } catch { sseClients.delete(client); }
  }
}

export default router;
