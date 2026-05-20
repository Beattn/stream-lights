import { Router } from "express";
import { db } from "@workspace/db";
import { triggersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { alertQueue } from "../lib/alert-queue.js";
import { logger } from "../lib/logger.js";
import crypto from "crypto";

const router = Router();

function parsePlatformEvent(platform: string, body: Record<string, unknown>): {
  eventType: string;
  username: string;
  message: string;
  amount?: number;
} | null {
  try {
    if (platform === "streamelements") {
      const type = body.type as string;
      const data = (body.data ?? {}) as Record<string, unknown>;
      return {
        eventType: mapStreamElementsType(type),
        username: (data.username as string) ?? "unknown",
        message: (data.message as string) ?? "",
        amount: typeof data.amount === "number" ? data.amount : typeof data.amount === "string" ? parseFloat(data.amount) : undefined,
      };
    }

    if (platform === "streamlabs") {
      const type = body.type as string;
      const message = ((body.message as unknown[]) ?? [])[0] as Record<string, unknown> ?? {};
      return {
        eventType: mapStreamlabsType(type),
        username: (message.name as string) ?? (message.from as string) ?? "unknown",
        message: (message.message as string) ?? "",
        amount: typeof message.amount === "number" ? message.amount : typeof message.amount === "string" ? parseFloat(message.amount as string) : undefined,
      };
    }

    if (platform === "twitch") {
      const event = (body.event ?? body) as Record<string, unknown>;
      const subType = (body.subscription as Record<string, unknown>)?.type as string ?? "";
      return {
        eventType: mapTwitchType(subType),
        username: (event.user_name as string) ?? (event.from_broadcaster_user_name as string) ?? "unknown",
        message: (event.message as Record<string, unknown>)?.text as string ?? "",
        amount: typeof event.bits === "number" ? event.bits : undefined,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function mapStreamElementsType(t: string): string {
  const map: Record<string, string> = {
    follower: "follow",
    subscriber: "subscribe",
    tip: "donation",
    cheer: "bits",
    raid: "raid",
    host: "host",
  };
  return map[t] ?? t;
}

function mapStreamlabsType(t: string): string {
  const map: Record<string, string> = {
    follow: "follow",
    subscription: "subscribe",
    donation: "donation",
    bits: "bits",
    raid: "raid",
    host: "host",
  };
  return map[t] ?? t;
}

function mapTwitchType(t: string): string {
  if (t.includes("follow")) return "follow";
  if (t.includes("subscribe")) return "subscribe";
  if (t.includes("cheer")) return "bits";
  if (t.includes("raid")) return "raid";
  if (t.includes("ban")) return "ban";
  if (t.includes("timeout")) return "timeout";
  if (t.includes("channel_points")) return "channel_point";
  return t;
}

async function matchAndFireTriggers(
  eventType: string,
  platform: string,
  username: string,
  message: string,
  amount?: number
): Promise<number> {
  const triggers = await db
    .select()
    .from(triggersTable)
    .where(and(eq(triggersTable.eventType, eventType), eq(triggersTable.enabled, true)));

  const matching = triggers.filter((t) => {
    if (t.platform && t.platform !== platform) return false;
    if (t.minAmount && amount !== undefined && amount < t.minAmount) return false;
    return true;
  });

  for (const trigger of matching) {
    let deviceIds: number[] = [];
    try { deviceIds = JSON.parse(trigger.deviceIds) as number[]; } catch { deviceIds = []; }

    alertQueue.enqueue(
      { color: trigger.color, brightness: trigger.brightness, effect: trigger.effect, durationMs: trigger.durationMs },
      { deviceIds: deviceIds.length > 0 ? deviceIds : undefined, returnToIdle: trigger.returnToIdle, eventType, platform, username, message }
    );
  }

  return matching.length;
}

router.post("/webhooks/:platform", async (req, res) => {
  const platform = req.params.platform;
  const validPlatforms = ["twitch", "youtube", "kick", "streamlabs", "streamelements"];
  if (!validPlatforms.includes(platform)) {
    return res.status(400).json({ error: "Unknown platform" });
  }

  if (platform === "twitch") {
    const msgType = req.headers["twitch-eventsub-message-type"] as string;
    if (msgType === "webhook_callback_verification") {
      const challenge = (req.body as Record<string, unknown>).challenge as string;
      return res.status(200).send(challenge);
    }

    const secret = process.env.TWITCH_EVENTSUB_SECRET;
    if (secret) {
      const msgId = req.headers["twitch-eventsub-message-id"] as string;
      const msgTimestamp = req.headers["twitch-eventsub-message-timestamp"] as string;
      const msgSignature = req.headers["twitch-eventsub-message-signature"] as string;
      const rawBody = JSON.stringify(req.body);
      const hmacMessage = msgId + msgTimestamp + rawBody;
      const hmac = "sha256=" + crypto.createHmac("sha256", secret).update(hmacMessage).digest("hex");
      if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(msgSignature ?? ""))) {
        return res.status(403).json({ error: "Invalid signature" });
      }
    }
  }

  const parsed = parsePlatformEvent(platform, req.body as Record<string, unknown>);
  if (!parsed) {
    return res.status(400).json({ error: "Could not parse event" });
  }

  const fired = await matchAndFireTriggers(parsed.eventType, platform, parsed.username, parsed.message, parsed.amount);
  logger.info({ platform, eventType: parsed.eventType, username: parsed.username, triggersMatched: fired }, "Webhook event received");
  res.json({ ok: true, platform, eventType: parsed.eventType, triggersMatched: fired });
});

router.post("/webhooks/:platform/test", async (req, res) => {
  const platform = req.params.platform;
  const { eventType = "follow", username = "testuser", message = "Test event", amount } = req.body as Record<string, unknown>;

  const fired = await matchAndFireTriggers(
    eventType as string, platform, username as string, message as string,
    typeof amount === "number" ? amount : undefined
  );

  res.json({ ok: true, platform, eventType, triggersMatched: fired });
});

export default router;
