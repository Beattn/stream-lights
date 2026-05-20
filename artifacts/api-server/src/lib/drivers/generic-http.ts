import type { Device } from "@workspace/db";
import type { LightParams } from "../light-engine.js";

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

export async function genericHttpApply(device: Device, params: LightParams): Promise<void> {
  if (!device.bridgeIp) throw new Error("generic_http requires bridgeIp (the webhook URL)");
  const rgb = hexToRgb(params.color);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (device.apiKey) headers["Authorization"] = `Bearer ${device.apiKey}`;

  await fetch(device.bridgeIp, {
    method: "POST",
    headers,
    body: JSON.stringify({
      color: params.color,
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
      brightness: params.brightness,
      effect: params.effect,
      durationMs: params.durationMs,
    }),
    signal: AbortSignal.timeout(8000),
  });
}

export async function genericHttpIdle(device: Device, idleColor: string, idleBrightness: number): Promise<void> {
  if (!device.bridgeIp) return;
  const rgb = hexToRgb(idleColor);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (device.apiKey) headers["Authorization"] = `Bearer ${device.apiKey}`;

  await fetch(device.bridgeIp, {
    method: "POST",
    headers,
    body: JSON.stringify({
      color: idleColor,
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
      brightness: idleBrightness,
      effect: "solid",
      durationMs: 0,
      idle: true,
    }),
    signal: AbortSignal.timeout(8000),
  });
}
