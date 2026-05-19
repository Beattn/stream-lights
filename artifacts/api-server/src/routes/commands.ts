import { Router } from "express";
import { db } from "@workspace/db";
import { commandsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const router = Router();

function parseCommand(c: typeof commandsTable.$inferSelect) {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
  };
}

router.get("/commands", async (req, res) => {
  try {
    const commands = await db.select().from(commandsTable).orderBy(commandsTable.createdAt);
    res.json(commands.map(parseCommand));
  } catch (err) {
    req.log.error({ err }, "Failed to list commands");
    res.status(500).json({ error: "Failed to list commands" });
  }
});

router.post("/commands", async (req, res) => {
  try {
    const body = z.object({
      name: z.string().min(1),
      command: z.string().min(1),
      color: z.string(),
      brightness: z.number().int().min(0).max(100),
      durationMs: z.number().int().min(100),
      effect: z.string(),
      enabled: z.boolean().optional(),
      cooldownSeconds: z.number().int().optional(),
    }).parse(req.body);

    const [command] = await db.insert(commandsTable).values({
      name: body.name,
      command: body.command.startsWith("!") ? body.command : `!${body.command}`,
      color: body.color,
      brightness: body.brightness,
      durationMs: body.durationMs,
      effect: body.effect,
      enabled: body.enabled ?? true,
      cooldownSeconds: body.cooldownSeconds ?? 30,
    }).returning();

    res.status(201).json(parseCommand(command));
  } catch (err) {
    req.log.error({ err }, "Failed to create command");
    res.status(400).json({ error: "Invalid command data" });
  }
});

router.patch("/commands/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = z.object({
      name: z.string().optional(),
      command: z.string().optional(),
      color: z.string().optional(),
      brightness: z.number().int().optional(),
      durationMs: z.number().int().optional(),
      effect: z.string().optional(),
      enabled: z.boolean().optional(),
      cooldownSeconds: z.number().int().optional(),
    }).parse(req.body);

    const updateData: Record<string, unknown> = { ...body };
    if (body.command) {
      updateData.command = body.command.startsWith("!") ? body.command : `!${body.command}`;
    }

    const [command] = await db.update(commandsTable).set(updateData).where(eq(commandsTable.id, id)).returning();
    if (!command) return res.status(404).json({ error: "Command not found" });
    res.json(parseCommand(command));
  } catch (err) {
    req.log.error({ err }, "Failed to update command");
    res.status(400).json({ error: "Failed to update command" });
  }
});

router.delete("/commands/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(commandsTable).where(eq(commandsTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete command");
    res.status(500).json({ error: "Failed to delete command" });
  }
});

export default router;
