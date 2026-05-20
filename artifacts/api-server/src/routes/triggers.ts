import { Router } from "express";
import { db } from "@workspace/db";
import { triggersTable, activityTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  parseId, nameSchema, hexColorSchema, effectSchema,
  platformSchema, eventTypeSchema,
} from "../lib/security.js";
import { alertQueue } from "../lib/alert-queue.js";
import { writeLimiter } from "../middlewares/rate-limit.js";

const router = Router();

function parseTrigger(t: typeof triggersTable.$inferSelect) {
  let deviceIds: number[] = [];
  try {
    deviceIds = JSON.parse(t.deviceIds) as number[];
    if (!Array.isArray(deviceIds)) deviceIds = [];
  } catch {
    deviceIds = [];
  }
  return { ...t, deviceIds, createdAt: t.createdAt.toISOString() };
}

router.get("/triggers", async (req, res) => {
  try {
    const triggers = await db.select().from(triggersTable).orderBy(triggersTable.createdAt);
    
    // Cache GET requests for 30 seconds to reduce database load
    res.set("Cache-Control", "public, max-age=30, s-maxage=30");
    res.json(triggers.map(parseTrigger));
  } catch (err) {
    req.log.error({ err }, "Failed to list triggers");
    res.status(500).json({ error: "Failed to list triggers" });
  }
});

router.post("/triggers", writeLimiter, async (req, res) => {
  try {
    const body = z.object({
      name: nameSchema,
      eventType: eventTypeSchema,
      platform: platformSchema.optional(),
      enabled: z.boolean().optional(),
      color: hexColorSchema,
      brightness: z.number().int().min(0).max(100),
      durationMs: z.number().int().min(100).max(60_000),
      effect: effectSchema,
      returnToIdle: z.boolean().optional(),
      minAmount: z.number().int().min(0).max(1_000_000).optional(),
      deviceIds: z.array(z.number().int().min(1).max(2_147_483_647)).max(50).optional(),
      audioUrl: z.string().url().optional(),
      audioFile: z.string().optional(),
      audioVolume: z.number().int().min(0).max(100).optional(),
    }).strict().parse(req.body);

    const [trigger] = await db.insert(triggersTable).values({
      name: body.name,
      eventType: body.eventType,
      platform: body.platform ?? null,
      enabled: body.enabled ?? true,
      color: body.color,
      brightness: body.brightness,
      durationMs: body.durationMs,
      effect: body.effect,
      returnToIdle: body.returnToIdle ?? true,
      minAmount: body.minAmount ?? null,
      deviceIds: JSON.stringify(body.deviceIds ?? []),
      audioUrl: body.audioUrl ?? null,
      audioFile: body.audioFile ?? null,
      audioVolume: body.audioVolume ?? 100,
    }).returning();

    res.status(201).json(parseTrigger(trigger));
  } catch (err) {
    req.log.error({ err }, "Failed to create trigger");
    res.status(400).json({ error: "Invalid trigger data" });
  }
});

router.get("/triggers/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [trigger] = await db.select().from(triggersTable).where(eq(triggersTable.id, id));
    if (!trigger) return res.status(404).json({ error: "Trigger not found" });
    
    // Cache individual trigger data for 1 minute
    res.set("Cache-Control", "public, max-age=60, s-maxage=60");
    res.json(parseTrigger(trigger));
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    res.status(status).json({ error: status < 500 ? (err as Error).message : "Failed to get trigger" });
  }
});

router.patch("/triggers/:id", writeLimiter, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const body = z.object({
      name: nameSchema.optional(),
      platform: platformSchema.optional(),
      enabled: z.boolean().optional(),
      color: hexColorSchema.optional(),
      brightness: z.number().int().min(0).max(100).optional(),
      durationMs: z.number().int().min(100).max(60_000).optional(),
      effect: effectSchema.optional(),
      returnToIdle: z.boolean().optional(),
      minAmount: z.number().int().min(0).max(1_000_000).optional(),
      deviceIds: z.array(z.number().int().min(1).max(2_147_483_647)).max(50).optional(),
      audioUrl: z.string().url().optional(),
      audioFile: z.string().optional(),
      audioVolume: z.number().int().min(0).max(100).optional(),
    }).strict().parse(req.body);

    const updateData: Record<string, unknown> = { ...body };
    if (body.deviceIds !== undefined) {
      updateData.deviceIds = JSON.stringify(body.deviceIds);
    }

    const [trigger] = await db.update(triggersTable).set(updateData).where(eq(triggersTable.id, id)).returning();
    if (!trigger) return res.status(404).json({ error: "Trigger not found" });
    res.json(parseTrigger(trigger));
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 400;
    res.status(status).json({ error: "Failed to update trigger" });
  }
});

router.delete("/triggers/:id", writeLimiter, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const result = await db.delete(triggersTable).where(eq(triggersTable.id, id)).returning();
    if (!result.length) return res.status(404).json({ error: "Trigger not found" });
    res.status(204).send();
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    res.status(status).json({ error: "Failed to delete trigger" });
  }
});

router.post("/triggers/:id/fire", writeLimiter, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [trigger] = await db.select().from(triggersTable).where(eq(triggersTable.id, id));
    if (!trigger) return res.status(404).json({ error: "Trigger not found" });
    if (!trigger.enabled) return res.status(400).json({ error: "Trigger is disabled" });

    let deviceIds: number[] = [];
    try { deviceIds = JSON.parse(trigger.deviceIds) as number[]; } catch { deviceIds = []; }

    alertQueue.enqueue(
      { 
        color: trigger.color, 
        brightness: trigger.brightness, 
        effect: trigger.effect, 
        durationMs: trigger.durationMs,
        audioUrl: trigger.audioUrl ?? undefined,
        audioVolume: trigger.audioVolume ?? 100,
      },
      {
        deviceIds: deviceIds.length > 0 ? deviceIds : undefined,
        returnToIdle: trigger.returnToIdle,
        eventType: trigger.eventType,
        platform: trigger.platform,
        username: "manual_test",
        message: `Manual fire: ${trigger.name}`,
      }
    );

    await db.insert(activityTable).values({
      eventType: trigger.eventType,
      platform: trigger.platform,
      username: "manual_test",
      message: `Manual fire: ${trigger.name}`,
      colorTriggered: trigger.color,
      effectTriggered: trigger.effect,
    });

    req.log.info({ triggerId: id }, "Trigger manually fired");
    res.json({ success: true, message: `Trigger "${trigger.name}" fired — lights activating` });
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    res.status(status).json({ error: "Failed to fire trigger" });
  }
});

export default router;
