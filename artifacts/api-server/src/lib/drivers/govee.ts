import type { Device } from "@workspace/db";
import type { LightParams } from "./light-engine";

const BASE = "https://developer-api.govee.com/v1";
const TIMEOUT_MS = 5000;

async function goveeRequest(apiKey: string, body: object): Promise<void> {
  await fetch(`${BASE}/devices/control`, {
    method: "PUT",
    headers: { "Govee-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function parseDeviceId(deviceId: string | null): { device: string; model: string } {
  if (!deviceId) throw new Error("Govee requires deviceId in format MODEL:MAC (e.g. H6159:AA:BB:CC)");
  const idx = deviceId.indexOf(":");
  if (idx === -1) throw new Error("Govee deviceId must be MODEL:MAC format");
  return { model: deviceId.slice(0, idx), device: deviceId.slice(idx + 1) };
}

function req(apiKey: string, device: string, model: string, cmd: object): Promise<void> {
  return goveeRequest(apiKey, { device, model, cmd });
}

export async function goveeApply(device: Device, params: LightParams): Promise<void> {
  if (!device.apiKey) throw new Error("Govee requires apiKey");
  const { device: mac, model } = parseDeviceId(device.deviceId);
  const rgb = hexToRgb(params.color);
  const key = device.apiKey;

  if (params.effect === "police") {
    // Sequential flashing — API latency provides natural pacing between flashes
    for (let i = 0; i < 4; i++) {
      await req(key, mac, model, { name: "color", value: { r: 255, g: 0, b: 0 } });
      await sleep(250);
      await req(key, mac, model, { name: "color", value: { r: 0, g: 0, b: 255 } });
      await sleep(250);
    }
  } else if (params.effect === "rainbow") {
    const colors = [
      { r: 255, g: 0, b: 0 }, { r: 255, g: 127, b: 0 }, { r: 255, g: 255, b: 0 },
      { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 }, { r: 139, g: 0, b: 255 },
    ];
    const delay = Math.max(200, params.durationMs / colors.length);
    for (const c of colors) {
      await req(key, mac, model, { name: "color", value: c });
      await sleep(delay);
    }
  } else if (params.effect === "strobe") {
    // Strobe: alternate brightness — API latency provides natural pacing
    for (let i = 0; i < 5; i++) {
      await req(key, mac, model, { name: "brightness", value: 100 });
      await sleep(120);
      await req(key, mac, model, { name: "brightness", value: 0 });
      await sleep(120);
    }
    // Restore at end
    await Promise.all([
      req(key, mac, model, { name: "color", value: rgb }),
      req(key, mac, model, { name: "brightness", value: params.brightness }),
    ]);
  } else {
    // Solid / pulse / fade / any other effect:
    // Fire turn-on + brightness + color in parallel — cuts response time from ~900ms to ~300ms
    await Promise.all([
      req(key, mac, model, { name: "turn", value: "on" }),
      req(key, mac, model, { name: "brightness", value: params.brightness }),
      req(key, mac, model, { name: "color", value: rgb }),
    ]);
  }
}

export async function goveeIdle(device: Device, idleColor: string, idleBrightness: number): Promise<void> {
  if (!device.apiKey || !device.deviceId) return;
  const { device: mac, model } = parseDeviceId(device.deviceId);
  const rgb = hexToRgb(idleColor);
  const key = device.apiKey;
  // Fire brightness + color in parallel for fast idle return
  await Promise.all([
    goveeRequest(key, { device: mac, model, cmd: { name: "brightness", value: idleBrightness } }),
    goveeRequest(key, { device: mac, model, cmd: { name: "color", value: rgb } }),
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
