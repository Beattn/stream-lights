import { db } from "@workspace/db";
import { devicesTable, settingsTable, activityTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { philipsHueApply, philipsHueIdle } from "./philips-hue";
import { lifxApply, lifxIdle } from "./lifx";
import { goveeApply, goveeIdle } from "./govee";
import { nanoleafApply, nanoleafIdle } from "./nanoleaf";
import { genericHttpApply, genericHttpIdle } from "./generic-http";
import { logger } from "../logger";

export interface EffectStep {
  color: string;
  durationMs: number;
  brightness?: number;
  effect?: string;
}

export interface LightParams {
  color: string;
  brightness: number;
  effect: string;
  durationMs: number;
  audioUrl?: string;
  audioVolume?: number;
  customSteps?: EffectStep[];
}

export interface FireOptions {
  deviceIds?: number[];
  returnToIdle?: boolean;
  eventType?: string;
  platform?: string | null;
  username?: string;
  message?: string;
}

async function getEnabledDevices(deviceIds?: number[]) {
  if (deviceIds && deviceIds.length > 0) {
    const devices = await db.select().from(devicesTable).where(inArray(devicesTable.id, deviceIds));
    return devices.filter((d) => d.enabled);
  }
  const devices = await db.select().from(devicesTable);
  return devices.filter((d) => d.enabled);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Cache settings in memory so every fireLights call doesn't hit the DB.
// Settings rarely change — 30s TTL is plenty fresh.
let cachedSettings: Awaited<ReturnType<typeof fetchSettings>> | null = null;
let settingsCachedAt = 0;
const SETTINGS_TTL_MS = 30_000;

async function fetchSettings() {
  const [settings] = await db.select().from(settingsTable).limit(1);
  return settings ?? {
    globalEnabled: true,
    idleColor: "#1a1a2e",
    idleBrightness: 30,
    idleEnabled: true,
    transitionSpeed: 500,
  };
}

async function getSettings() {
  const now = Date.now();
  if (!cachedSettings || now - settingsCachedAt > SETTINGS_TTL_MS) {
    cachedSettings = await fetchSettings();
    settingsCachedAt = now;
  }
  return cachedSettings;
}

/** Call after saving new settings so the next fireLights picks them up immediately. */
export function invalidateSettingsCache() {
  cachedSettings = null;
}

async function applyRaw(device: typeof devicesTable.$inferSelect, params: LightParams): Promise<void> {
  switch (device.type) {
    case "philips_hue": await philipsHueApply(device, params); break;
    case "lifx": await lifxApply(device, params); break;
    case "govee": await goveeApply(device, params); break;
    case "nanoleaf": await nanoleafApply(device, params); break;
    case "generic_http": await genericHttpApply(device, params); break;
    default:
      logger.warn({ deviceType: device.type }, "Unknown device type — skipping");
  }
}

async function applyToDevice(
  device: typeof devicesTable.$inferSelect,
  params: LightParams
): Promise<void> {
  try {
    if (params.effect === "custom" && params.customSteps && params.customSteps.length > 0) {
      for (const step of params.customSteps) {
        await applyRaw(device, {
          ...params,
          color: step.color,
          brightness: step.brightness ?? params.brightness,
          effect: step.effect ?? "solid",
        });
        await sleep(step.durationMs);
      }
    } else {
      await applyRaw(device, params);
    }
    // Fire-and-forget: don't block the alert pipeline waiting for a bookkeeping DB write
    void db.update(devicesTable).set({ currentColor: params.color, brightness: params.brightness }).where(eq(devicesTable.id, device.id));
  } catch (err) {
    logger.error({ err, deviceId: device.id, deviceType: device.type }, "Failed to apply light to device");
  }
}

async function returnToIdleForDevice(device: typeof devicesTable.$inferSelect, idleColor: string, idleBrightness: number): Promise<void> {
  try {
    switch (device.type) {
      case "philips_hue": await philipsHueIdle(device, idleColor, idleBrightness); break;
      case "lifx": await lifxIdle(device, idleColor, idleBrightness); break;
      case "govee": await goveeIdle(device, idleColor, idleBrightness); break;
      case "nanoleaf": await nanoleafIdle(device, idleColor, idleBrightness); break;
      case "generic_http": await genericHttpIdle(device, idleColor, idleBrightness); break;
    }
    await db.update(devicesTable).set({ currentColor: idleColor, brightness: idleBrightness }).where(eq(devicesTable.id, device.id));
  } catch (err) {
    logger.error({ err, deviceId: device.id }, "Failed to return device to idle");
  }
}

export async function fireLights(params: LightParams, opts: FireOptions = {}): Promise<void> {
  const settings = await getSettings();
  if (!settings.globalEnabled) {
    logger.info("Global lights disabled — skipping");
    return;
  }

  const devices = await getEnabledDevices(opts.deviceIds);
  if (devices.length === 0) {
    logger.warn("No enabled devices found — skipping light command");
    return;
  }

  await Promise.allSettled(devices.map((d) => applyToDevice(d, params)));

  if (opts.eventType) {
    await db.insert(activityTable).values({
      eventType: opts.eventType,
      platform: opts.platform ?? null,
      username: opts.username ?? null,
      message: opts.message ?? null,
      colorTriggered: params.color,
      effectTriggered: params.effect,
    }).catch(() => {});
  }

  if (opts.returnToIdle !== false && settings.idleEnabled) {
    const effectDurationMs =
      params.effect === "custom" && params.customSteps?.length
        ? params.customSteps.reduce((sum, s) => sum + s.durationMs, 0)
        : params.durationMs;
    // Reuse the devices list we already fetched — no extra DB round-trip
    setTimeout(() => {
      void Promise.allSettled(
        devices.map((d) => returnToIdleForDevice(d, settings.idleColor, settings.idleBrightness))
      );
    }, effectDurationMs);
  }
}

export async function returnToIdle(deviceIds?: number[]): Promise<void> {
  const settings = await getSettings();
  const devices = await getEnabledDevices(deviceIds);
  await Promise.allSettled(
    devices.map((d) => returnToIdleForDevice(d, settings.idleColor, settings.idleBrightness))
  );
}
