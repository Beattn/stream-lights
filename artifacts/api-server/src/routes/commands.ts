import { Router } from "express";
import { db } from "@workspace/db";
import { commandsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { parseId, nameSchema, hexColorSchema, effectSchema } from "../lib/security";
import { writeLimiter } from "../middlewares/rate-limit";

const router = Router();

const chatCommandSchema = z
  .string()
  .min(2)
  .max(50)
  .regex(/^!?[a-zA-Z0-9_]+$/, "Command must be alphanumeric (optionally prefixed with !)");

function serializeCommand(c: typeof commandsTable.$inferSelect) {
  return { ...c, createdAt: c.createdAt.toISOString() };
}

router.get("/commands", async (req, res) => {
  try {
    const commands = await db.select().from(commandsTable).orderBy(commandsTable.createdAt);
    res.json(commands.map(serializeCommand));
  } catch (err) {
    req.log.error({ err }, "Failed to list commands");
    res.status(500).json({ error: "Failed to list commands" });
  }
});

router.post("/commands", writeLimiter, async (req, res) => {
  try {
    const body = z.object({
      name: nameSchema,
      command: chatCommandSchema,
      color: hexColorSchema,
      brightness: z.number().int().min(0).max(100),
      durationMs: z.number().int().min(100).max(60_000),
      effect: effectSchema,
      enabled: z.boolean().optional(),
      cooldownSeconds: z.number().int().min(0).max(86_400).optional(),
    }).strict().parse(req.body);

    const normalized = body.command.startsWith("!") ? body.command : `!${body.command}`;

    const [command] = await db.insert(commandsTable).values({
      name: body.name,
      command: normalized,
      color: body.color,
      brightness: body.brightness,
      durationMs: body.durationMs,
      effect: body.effect,
      enabled: body.enabled ?? true,
      cooldownSeconds: body.cooldownSeconds ?? 30,
    }).returning();

    res.status(201).json(serializeCommand(command));
  } catch (err) {
    req.log.error({ err }, "Failed to create command");
    res.status(400).json({ error: "Invalid command data" });
  }
});

router.patch("/commands/:id", writeLimiter, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const body = z.object({
      name: nameSchema.optional(),
      command: chatCommandSchema.optional(),
      color: hexColorSchema.optional(),
      brightness: z.number().int().min(0).max(100).optional(),
      durationMs: z.number().int().min(100).max(60_000).optional(),
      effect: effectSchema.optional(),
      enabled: z.boolean().optional(),
      cooldownSeconds: z.number().int().min(0).max(86_400).optional(),
    }).strict().parse(req.body);

    const updateData: Record<string, unknown> = { ...body };
    if (body.command) {
      updateData.command = body.command.startsWith("!") ? body.command : `!${body.command}`;
    }

    const [command] = await db.update(commandsTable).set(updateData).where(eq(commandsTable.id, id)).returning();
    if (!command) return res.status(404).json({ error: "Command not found" });
    res.json(serializeCommand(command));
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 400;
    res.status(status).json({ error: "Failed to update command" });
  }
});

router.delete("/commands/:id", writeLimiter, async (req, res) => {
  try {
    const id = parseId(req.params.id);
    const result = await db.delete(commandsTable).where(eq(commandsTable.id, id)).returning();
    if (!result.length) return res.status(404).json({ error: "Command not found" });
    res.status(204).send();
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    res.status(status).json({ error: "Failed to delete command" });
  }
});

export default router;
