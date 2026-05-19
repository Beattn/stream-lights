import { Router } from "express";
import { db } from "@workspace/db";
import { triggersTable, activityTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

const router = Router();

function parseTrigger(t: typeof triggersTable.$inferSelect) {
  return {
    ...t,
    deviceIds: JSON.parse(t.deviceIds) as number[],
    createdAt: t.createdAt.toISOString(),
  };
}

router.get("/triggers", async (req, res) => {
  try {
    const triggers = await db.select().from(triggersTable).orderBy(triggersTable.createdAt);
    res.json(triggers.map(parseTrigger));
  } catch (err) {
    req.log.error({ err }, "Failed to list triggers");
    res.status(500).json({ error: "Failed to list triggers" });
  }
});

router.post("/triggers", async (req, res) => {
  try {
    const body = z.object({
      name: z.string().min(1),
      eventType: z.string().min(1),
      platform: z.string().optional(),
      enabled: z.boolean().optional(),
      color: z.string(),
      brightness: z.number().int().min(0).max(100),
      durationMs: z.number().int().min(100),
      effect: z.string(),
      returnToIdle: z.boolean().optional(),
      minAmount: z.number().int().optional(),
      deviceIds: z.array(z.number()).optional(),
    }).parse(req.body);

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
    }).returning();

    res.status(201).json(parseTrigger(trigger));
  } catch (err) {
    req.log.error({ err }, "Failed to create trigger");
    res.status(400).json({ error: "Invalid trigger data" });
  }
});

router.get("/triggers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [trigger] = await db.select().from(triggersTable).where(eq(triggersTable.id, id));
    if (!trigger) return res.status(404).json({ error: "Trigger not found" });
    res.json(parseTrigger(trigger));
  } catch (err) {
    req.log.error({ err }, "Failed to get trigger");
    res.status(500).json({ error: "Failed to get trigger" });
  }
});

router.patch("/triggers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = z.object({
      name: z.string().optional(),
      platform: z.string().optional(),
      enabled: z.boolean().optional(),
      color: z.string().optional(),
      brightness: z.number().int().optional(),
      durationMs: z.number().int().optional(),
      effect: z.string().optional(),
      returnToIdle: z.boolean().optional(),
      minAmount: z.number().int().optional(),
      deviceIds: z.array(z.number()).optional(),
    }).parse(req.body);

    const updateData: Record<string, unknown> = { ...body };
    if (body.deviceIds !== undefined) {
      updateData.deviceIds = JSON.stringify(body.deviceIds);
    }

    const [trigger] = await db.update(triggersTable).set(updateData).where(eq(triggersTable.id, id)).returning();
    if (!trigger) return res.status(404).json({ error: "Trigger not found" });
    res.json(parseTrigger(trigger));
  } catch (err) {
    req.log.error({ err }, "Failed to update trigger");
    res.status(400).json({ error: "Failed to update trigger" });
  }
});

router.delete("/triggers/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(triggersTable).where(eq(triggersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete trigger");
    res.status(500).json({ error: "Failed to delete trigger" });
  }
});

router.post("/triggers/:id/fire", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [trigger] = await db.select().from(triggersTable).where(eq(triggersTable.id, id));
    if (!trigger) return res.status(404).json({ error: "Trigger not found" });

    await db.insert(activityTable).values({
      eventType: trigger.eventType,
      platform: trigger.platform,
      username: "manual_test",
      message: `Manual fire: ${trigger.name}`,
      colorTriggered: trigger.color,
      effectTriggered: trigger.effect,
    });

    req.log.info({ triggerId: id }, "Trigger manually fired");
    res.json({ success: true, message: `Trigger "${trigger.name}" fired successfully` });
  } catch (err) {
    req.log.error({ err }, "Failed to fire trigger");
    res.status(500).json({ error: "Failed to fire trigger" });
  }
});

export default router;
