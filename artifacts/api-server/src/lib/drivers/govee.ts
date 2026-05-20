import type { Device } from "@workspace/db";
import type { LightParams } from "../light-engine.js";

const BASE = "https://developer-api.govee.com/v1";

async function goveeRequest(apiKey: string, body: object): Promise<void> {
  await fetch(`${BASE}/devices/control`, {
    method: "PUT",
    headers: { "Govee-API-Key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
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

export async function goveeApply(device: Device, params: LightParams): Promise<void> {
  if (!device.apiKey) throw new Error("Govee requires apiKey");
  const { device: mac, model } = parseDeviceId(device.deviceId);
  const rgb = hexToRgb(params.color);

  await goveeRequest(device.apiKey, { device: mac, model, cmd: { name: "turn", value: "on" } });
  await goveeRequest(device.apiKey, { device: mac, model, cmd: { name: "brightness", value: params.brightness } });

  if (params.effect === "police") {
    for (let i = 0; i < 4; i++) {
      await goveeRequest(device.apiKey, { device: mac, model, cmd: { name: "color", value: { r: 255, g: 0, b: 0 } } });
      await sleep(300);
      await goveeRequest(device.apiKey, { device: mac, model, cmd: { name: "color", value: { r: 0, g: 0, b: 255 } } });
      await sleep(300);
    }
  } else if (params.effect === "rainbow") {
    const colors = [
      { r: 255, g: 0, b: 0 }, { r: 255, g: 127, b: 0 }, { r: 255, g: 255, b: 0 },
      { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 }, { r: 139, g: 0, b: 255 },
    ];
    const delay = params.durationMs / colors.length;
    for (const c of colors) {
      await goveeRequest(device.apiKey, { device: mac, model, cmd: { name: "color", value: c } });
      await sleep(delay);
    }
  } else if (params.effect === "strobe") {
    for (let i = 0; i < 6; i++) {
      await goveeRequest(device.apiKey, { device: mac, model, cmd: { name: "turn", value: "on" } });
      await sleep(150);
      await goveeRequest(device.apiKey, { device: mac, model, cmd: { name: "turn", value: "off" } });
      await sleep(150);
    }
    await goveeRequest(device.apiKey, { device: mac, model, cmd: { name: "turn", value: "on" } });
    await goveeRequest(device.apiKey, { device: mac, model, cmd: { name: "color", value: rgb } });
  } else {
    await goveeRequest(device.apiKey, { device: mac, model, cmd: { name: "color", value: rgb } });
  }
}

export async function goveeIdle(device: Device, idleColor: string, idleBrightness: number): Promise<void> {
  if (!device.apiKey || !device.deviceId) return;
  const { device: mac, model } = parseDeviceId(device.deviceId);
  const rgb = hexToRgb(idleColor);
  await goveeRequest(device.apiKey, { device: mac, model, cmd: { name: "brightness", value: idleBrightness } });
  await goveeRequest(device.apiKey, { device: mac, model, cmd: { name: "color", value: rgb } });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
