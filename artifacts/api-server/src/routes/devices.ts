import { Router } from "express";
import { db } from "@workspace/db";
import { devicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { parseId, nameSchema, hexColorSchema, effectSchema, omitKeys } from "../lib/security";
import { alertQueue } from "../lib/drivers/alert-queue";
import { writeLimiter } from "../middlewares/rate-limit";

const router = Router();

const VALID_DEVICE_TYPES = [
  "philips_hue", "lifx", "govee", "nanoleaf", "generic_http",
] as const;

const ipSchema = z
  .string()
  .max(500)
  .optional();

function serializeDevice(d: typeof devicesTable.$inferSelect) {
  return omitKeys({ ...d, createdAt: d.createdAt.toISOString() }, ["apiKey"]);
}

router.get("/devices", async (req, res) => {
  try {
    const devices = await db.select().from(devicesTable).orderBy(devicesTable.createdAt);
    res.json(devices.map(serializeDevice));
  } catch (err) {
    req.log.error({ err }, "Failed to list devices");
    res.status(500).json({ error: "Failed to list devices" });
  }
});

router.post("/devices", writeLimiter, async (req, res) => {
  try {
    const body = z.object({
      name: nameSchema,
      type: z.enum(VALID_DEVICE_TYPES),
      bridgeIp: ipSchema,
      apiKey: z.string().max(500).optional(),
      deviceId: z.string().max(200).optional(),
      enabled: z.boolean().optional(),
    }).strict().parse(req.body);

    const [device] = await db.insert(devicesTable).values({
      name: body.name,
      type: body.type,
      bridgeIp: body.bridgeIp ?? null,
      apiKey: body.apiKey ?? null,
      deviceId: body.deviceId ?? null,
      enabled: body.enabled ?? true,
    }).returning();

    res.status(201).json(serializeDevice(device));
  } catch (err) {
    req.log.error({ err }, "Failed to create device");
    res.status(400).json({ error: "Invalid device data" });
  }
});

router.get("/devices/:id", async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, id));
    if (!device) return res.status(404).json({ error: "Device not found" });
    res.json(serializeDevice(device));
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    res.status(status).json({ error: status < 500 ? (err as Error).message : "Failed to get device" });
  }
});

router.patch("/devices/:id", writeLimiter, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const body = z.object({
      name: nameSchema.optional(),
      bridgeIp: ipSchema,
      apiKey: z.string().max(500).optional(),
      deviceId: z.string().max(200).optional(),
      enabled: z.boolean().optional(),
    }).strict().parse(req.body);

    const [device] = await db.update(devicesTable).set(body).where(eq(devicesTable.id, id)).returning();
    if (!device) return res.status(404).json({ error: "Device not found" });
    res.json(serializeDevice(device));
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 400;
    res.status(status).json({ error: "Failed to update device" });
  }
});

router.delete("/devices/:id", writeLimiter, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const result = await db.delete(devicesTable).where(eq(devicesTable.id, id)).returning();
    if (!result.length) return res.status(404).json({ error: "Device not found" });
    res.status(204).send();
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    res.status(status).json({ error: "Failed to delete device" });
  }
});

router.post("/devices/:id/test", writeLimiter, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, id));
    if (!device) return res.status(404).json({ error: "Device not found" });

    const body = z.object({
      color: hexColorSchema,
      brightness: z.number().int().min(0).max(100),
      durationMs: z.number().int().min(100).max(30_000),
      effect: effectSchema,
    }).strict().parse(req.body);

    alertQueue.enqueue(
      { color: body.color, brightness: body.brightness, effect: body.effect, durationMs: body.durationMs },
      { deviceIds: [id], returnToIdle: true, eventType: "light_preview", username: "test" }
    );

    req.log.info({ deviceId: id, effect: body.effect }, "Test light triggered");
    res.json({ success: true, message: `Test flash sent to ${device.name}` });
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 400;
    res.status(status).json({ error: "Failed to test device" });
  }
});

router.post("/devices/:id/toggle", writeLimiter, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, id));
    if (!device) return res.status(404).json({ error: "Device not found" });

    const [updated] = await db.update(devicesTable)
      .set({ enabled: !device.enabled })
      .where(eq(devicesTable.id, id))
      .returning();

    res.json(serializeDevice(updated));
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    res.status(status).json({ error: "Failed to toggle device" });
  }
});

export default router;
