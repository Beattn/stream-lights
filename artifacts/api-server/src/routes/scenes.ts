import { Router } from "express";
import { db } from "@workspace/db";
import { devicesTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { hexColorSchema, effectSchema, nameSchema } from "../lib/security";
import { fireLights } from "../lib/drivers/light-engine";
import { writeLimiter } from "../middlewares/rate-limit";

const router = Router();

interface Scene {
  id: string;
  name: string;
  color: string;
  brightness: number;
  effect: string;
  deviceIds: number[];
  createdAt: string;
}

const scenes = new Map<string, Scene>();

const sceneSchema = z.object({
  name: nameSchema,
  color: hexColorSchema,
  brightness: z.number().int().min(0).max(100),
  effect: effectSchema,
  deviceIds: z.array(z.number().int().min(1)).max(50).optional(),
});

router.get("/scenes", (_req, res) => {
  res.json([...scenes.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
});

router.post("/scenes", writeLimiter, (req, res) => {
  try {
    const body = sceneSchema.parse(req.body);
    const id = `scene_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const scene: Scene = {
      id,
      name: body.name,
      color: body.color,
      brightness: body.brightness,
      effect: body.effect,
      deviceIds: body.deviceIds ?? [],
      createdAt: new Date().toISOString(),
    };
    scenes.set(id, scene);
    res.status(201).json(scene);
  } catch {
    res.status(400).json({ error: "Invalid scene data" });
  }
});

router.patch("/scenes/:id", writeLimiter, (req, res) => {
  const scene = scenes.get(req.params.id);
  if (!scene) return res.status(404).json({ error: "Scene not found" });
  try {
    const body = sceneSchema.partial().parse(req.body);
    const updated = { ...scene, ...body, deviceIds: body.deviceIds ?? scene.deviceIds };
    scenes.set(scene.id, updated);
    res.json(updated);
  } catch {
    res.status(400).json({ error: "Invalid scene data" });
  }
});

router.delete("/scenes/:id", writeLimiter, (req, res) => {
  if (!scenes.has(req.params.id)) return res.status(404).json({ error: "Scene not found" });
  scenes.delete(req.params.id);
  res.status(204).send();
});

router.post("/scenes/:id/activate", writeLimiter, async (req, res) => {
  const scene = scenes.get(req.params.id);
  if (!scene) return res.status(404).json({ error: "Scene not found" });

  await fireLights(
    { color: scene.color, brightness: scene.brightness, effect: scene.effect, durationMs: 0 },
    { deviceIds: scene.deviceIds.length > 0 ? scene.deviceIds : undefined, returnToIdle: false, eventType: "light_preview" }
  );

  res.json({ success: true, message: `Scene "${scene.name}" activated` });
});

router.get("/scenes/presets", (_req, res) => {
  const presets = [
    { name: "🔴 Red Alert", color: "#FF0000", brightness: 100, effect: "strobe" },
    { name: "🟢 Go Live", color: "#00FF88", brightness: 80, effect: "pulse" },
    { name: "🔵 Chill Mode", color: "#0044FF", brightness: 40, effect: "solid" },
    { name: "🌈 Party Time", color: "#FF00FF", brightness: 100, effect: "rainbow" },
    { name: "🚓 Police", color: "#FF0000", brightness: 100, effect: "police" },
    { name: "⚡ Hype Train", color: "#FFFF00", brightness: 100, effect: "strobe" },
    { name: "💜 Twitch Purple", color: "#9147FF", brightness: 70, effect: "fade" },
    { name: "❤️ Sub Love", color: "#FF69B4", brightness: 80, effect: "pulse" },
    { name: "💰 Donation Gold", color: "#FFD700", brightness: 90, effect: "pulse" },
    { name: "💤 Idle Dark", color: "#1a1a2e", brightness: 20, effect: "solid" },
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
