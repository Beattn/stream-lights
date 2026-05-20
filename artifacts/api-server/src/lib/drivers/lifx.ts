import type { Device } from "@workspace/db";
import type { LightParams } from "./light-engine";

const BASE = "https://api.lifx.com/v1/lights";

async function lifxRequest(
  apiKey: string,
  selector: string,
  endpoint: string,
  body: object
): Promise<void> {
  await fetch(`${BASE}/${selector}/${endpoint}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
}

function hexToHsl(hex: string): { hue: number; saturation: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;
  }
  const saturation = max === 0 ? 0 : delta / max;
  return { hue, saturation: Math.round(saturation * 100) / 100 };
}

export async function lifxApply(device: Device, params: LightParams): Promise<void> {
  if (!device.apiKey) throw new Error("LIFX requires apiKey");
  const selector = device.deviceId ?? "all";
  const { hue, saturation } = hexToHsl(params.color);
  const brightness = params.brightness / 100;

  if (params.effect === "strobe") {
    await lifxRequest(device.apiKey, selector, "effects/pulse", {
      color: `hue:${hue} saturation:${saturation} brightness:${brightness}`,
      from_color: "brightness:0",
      period: 0.3,
      cycles: 6,
      persist: false,
    });
  } else if (params.effect === "police") {
    for (let i = 0; i < 4; i++) {
      await lifxRequest(device.apiKey, selector, "state", { color: "red", brightness: 1, fast: true });
      await sleep(300);
      await lifxRequest(device.apiKey, selector, "state", { color: "blue", brightness: 1, fast: true });
      await sleep(300);
    }
    await lifxRequest(device.apiKey, selector, "state", {
      color: `hue:${hue} saturation:${saturation} brightness:${brightness}`,
    });
  } else if (params.effect === "rainbow") {
    const hues = [0, 30, 60, 120, 240, 270];
    const delay = params.durationMs / hues.length;
    for (const h of hues) {
      await lifxRequest(device.apiKey, selector, "state", { color: `hue:${h} saturation:1 brightness:1`, fast: true });
      await sleep(delay);
    }
  } else {
    await lifxRequest(device.apiKey, selector, "state", {
      color: `hue:${hue} saturation:${saturation} brightness:${brightness}`,
      power: "on",
    });
  }
}

export async function lifxIdle(device: Device, idleColor: string, idleBrightness: number): Promise<void> {
  if (!device.apiKey) return;
  const selector = device.deviceId ?? "all";
  const { hue, saturation } = hexToHsl(idleColor);
  await lifxRequest(device.apiKey, selector, "state", {
    color: `hue:${hue} saturation:${saturation} brightness:${idleBrightness / 100}`,
    power: "on",
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
