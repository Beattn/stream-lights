import { Router } from "express";
import { db } from "@workspace/db";
import { scenesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { hexColorSchema, effectSchema, nameSchema, parseId } from "../lib/security";
import { fireLights } from "../lib/drivers/light-engine";
import { writeLimiter } from "../middlewares/rate-limit";

const router = Router();

const sceneSchema = z.object({
  name: nameSchema,
  color: hexColorSchema,
  brightness: z.number().int().min(0).max(100),
  effect: effectSchema,
  deviceIds: z.array(z.number().int().min(1)).max(50).optional(),
});

function serializeScene(s: typeof scenesTable.$inferSelect) {
  let deviceIds: number[] = [];
  try { deviceIds = JSON.parse(s.deviceIds) as number[]; } catch { deviceIds = []; }
  return { ...s, deviceIds, createdAt: s.createdAt.toISOString() };
}

router.get("/scenes", async (_req, res) => {
  try {
    const all = await db.select().from(scenesTable).orderBy(scenesTable.createdAt);
    res.set("Cache-Control", "no-store");
    res.json(all.map(serializeScene));
  } catch (err) {
    res.status(500).json({ error: "Failed to list scenes" });
  }
});

router.post("/scenes", writeLimiter, async (req, res) => {
  try {
    const body = sceneSchema.parse(req.body);
    const [scene] = await db.insert(scenesTable).values({
      name: body.name,
      color: body.color,
      brightness: body.brightness,
      effect: body.effect,
      deviceIds: JSON.stringify(body.deviceIds ?? []),
    }).returning();
    res.status(201).json(serializeScene(scene));
  } catch {
    res.status(400).json({ error: "Invalid scene data" });
  }
});

router.patch("/scenes/:id", writeLimiter, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const body = sceneSchema.partial().parse(req.body);
    const updateData: Record<string, unknown> = { ...body };
    if (body.deviceIds !== undefined) updateData.deviceIds = JSON.stringify(body.deviceIds);

    const [updated] = await db.update(scenesTable).set(updateData).where(eq(scenesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Scene not found" });
    res.json(serializeScene(updated));
  } catch {
    res.status(400).json({ error: "Invalid scene data" });
  }
});

router.delete("/scenes/:id", writeLimiter, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const result = await db.delete(scenesTable).where(eq(scenesTable.id, id)).returning();
    if (!result.length) return res.status(404).json({ error: "Scene not found" });
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Failed to delete scene" });
  }
});

router.post("/scenes/:id/activate", writeLimiter, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const [scene] = await db.select().from(scenesTable).where(eq(scenesTable.id, id));
    if (!scene) return res.status(404).json({ error: "Scene not found" });

    let deviceIds: number[] = [];
    try { deviceIds = JSON.parse(scene.deviceIds) as number[]; } catch { deviceIds = []; }

    await fireLights(
      { color: scene.color, brightness: scene.brightness, effect: scene.effect, durationMs: 0 },
      { deviceIds: deviceIds.length > 0 ? deviceIds : undefined, returnToIdle: false, eventType: "light_preview" }
    );

    res.json({ success: true, message: `Scene "${scene.name}" activated` });
  } catch {
    res.status(500).json({ error: "Failed to activate scene" });
  }
});

router.get("/scenes/presets", (_req, res) => {
  const presets = [
    { name: "Red Alert",    color: "#FF0000", brightness: 100, effect: "strobe" },
    { name: "Go Live",      color: "#53FC18", brightness: 80,  effect: "pulse"  },
    { name: "Chill Mode",   color: "#0044FF", brightness: 40,  effect: "solid"  },
    { name: "Party Time",   color: "#FF00FF", brightness: 100, effect: "rainbow"},
    { name: "Police",       color: "#FF0000", brightness: 100, effect: "police" },
    { name: "Hype Train",   color: "#FFFF00", brightness: 100, effect: "strobe" },
    { name: "Sub Love",     color: "#FF69B4", brightness: 80,  effect: "pulse"  },
    { name: "Donation Gold",color: "#FFD700", brightness: 90,  effect: "pulse"  },
    { name: "Idle Dark",    color: "#1a1a2e", brightness: 20,  effect: "solid"  },
  ];
  res.json(presets);
});

router.post("/scenes/quick-fire", writeLimiter, async (req, res) => {
  try {
    const body = z.object({
      color: hexColorSchema,
      brightness: z.number().int().min(0).max(100),
      effect: effectSchema,
      durationMs: z.number().int().min(100).max(30000).default(3000),
      deviceIds: z.array(z.number().int().min(1)).max(50).optional(),
    }).parse(req.body);

    await fireLights(
      { color: body.color, brightness: body.brightness, effect: body.effect, durationMs: body.durationMs },
      { deviceIds: body.deviceIds, returnToIdle: true, eventType: "light_preview" }
    );

    res.json({ success: true });
  } catch {
    res.status(400).json({ error: "Invalid quick-fire data" });
  }
});

export default router;
