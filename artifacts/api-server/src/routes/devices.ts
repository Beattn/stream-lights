import { Router } from "express";
import { db } from "@workspace/db";
import { devicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

router.get("/devices", async (req, res) => {
  try {
    const devices = await db.select().from(devicesTable).orderBy(devicesTable.createdAt);
    res.json(devices.map(d => ({ ...d, createdAt: d.createdAt.toISOString() })));
  } catch (err) {
    req.log.error({ err }, "Failed to list devices");
    res.status(500).json({ error: "Failed to list devices" });
  }
});

router.post("/devices", async (req, res) => {
  try {
    const body = z.object({
      name: z.string().min(1),
      type: z.string().min(1),
      bridgeIp: z.string().optional(),
      apiKey: z.string().optional(),
      deviceId: z.string().optional(),
      enabled: z.boolean().optional(),
    }).parse(req.body);

    const [device] = await db.insert(devicesTable).values({
      name: body.name,
      type: body.type,
      bridgeIp: body.bridgeIp ?? null,
      apiKey: body.apiKey ?? null,
      deviceId: body.deviceId ?? null,
      enabled: body.enabled ?? true,
    }).returning();

    res.status(201).json({ ...device, createdAt: device.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to create device");
    res.status(400).json({ error: "Invalid device data" });
  }
});

router.get("/devices/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, id));
    if (!device) return res.status(404).json({ error: "Device not found" });
    res.json({ ...device, createdAt: device.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to get device");
    res.status(500).json({ error: "Failed to get device" });
  }
});

router.patch("/devices/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = z.object({
      name: z.string().optional(),
      bridgeIp: z.string().optional(),
      apiKey: z.string().optional(),
      deviceId: z.string().optional(),
      enabled: z.boolean().optional(),
    }).parse(req.body);

    const [device] = await db.update(devicesTable).set(body).where(eq(devicesTable.id, id)).returning();
    if (!device) return res.status(404).json({ error: "Device not found" });
    res.json({ ...device, createdAt: device.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to update device");
    res.status(400).json({ error: "Failed to update device" });
  }
});

router.delete("/devices/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(devicesTable).where(eq(devicesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete device");
    res.status(500).json({ error: "Failed to delete device" });
  }
});

router.post("/devices/:id/test", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, id));
    if (!device) return res.status(404).json({ error: "Device not found" });

    const body = z.object({
      color: z.string(),
      brightness: z.number(),
      durationMs: z.number(),
      effect: z.string(),
      deviceIds: z.array(z.number()).optional(),
    }).parse(req.body);

    await db.update(devicesTable).set({
      currentColor: body.color,
      brightness: body.brightness,
    }).where(eq(devicesTable.id, id));

    req.log.info({ deviceId: id, color: body.color, effect: body.effect }, "Test light triggered");
    res.json({ success: true, message: `Test flash sent to ${device.name}` });
  } catch (err) {
    req.log.error({ err }, "Failed to test device");
    res.status(400).json({ error: "Failed to test device" });
  }
});

router.post("/devices/:id/toggle", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, id));
    if (!device) return res.status(404).json({ error: "Device not found" });

    const [updated] = await db.update(devicesTable)
      .set({ enabled: !device.enabled })
      .where(eq(devicesTable.id, id))
      .returning();

    res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
  } catch (err) {
    req.log.error({ err }, "Failed to toggle device");
    res.status(500).json({ error: "Failed to toggle device" });
  }
});

export default router;
