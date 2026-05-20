import { fireLights, returnToIdle, type LightParams, type FireOptions } from "./light-engine";
import { logger } from "../logger";

interface QueuedAlert {
  params: LightParams;
  opts: FireOptions;
}

class AlertQueue {
  private queue: QueuedAlert[] = [];
  private processing = false;
  private cooldowns = new Map<string, number>();

  enqueue(params: LightParams, opts: FireOptions = {}): boolean {
    const key = opts.eventType ?? "manual";
    const now = Date.now();
    const lastFired = this.cooldowns.get(key) ?? 0;
    const cooldownMs = 200;

    if (now - lastFired < cooldownMs) {
      logger.debug({ key }, "Alert throttled by cooldown");
      return false;
    }

    if (this.queue.length >= 10) {
      logger.warn("Alert queue full — dropping oldest");
      this.queue.shift();
    }

    this.queue.push({ params, opts });
    this.cooldowns.set(key, now);

    if (!this.processing) this.processNext();
    return true;
  }

  private async processNext(): Promise<void> {
    const alert = this.queue.shift();
    if (!alert) {
      this.processing = false;
      return;
    }

    this.processing = true;
    try {
      await fireLights(alert.params, { ...alert.opts, returnToIdle: false });
      await sleep(alert.params.durationMs);

      const hasMore = this.queue.length > 0;
      if (!hasMore && alert.opts.returnToIdle !== false) {
        await returnToIdle(alert.opts.deviceIds);
      }
    } catch (err) {
      logger.error({ err }, "Alert queue processing error");
    }

    this.processNext();
  }

  clear(): void {
    this.queue = [];
  }

  get length(): number {
    return this.queue.length;
  }
}

export const alertQueue = new AlertQueue();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
