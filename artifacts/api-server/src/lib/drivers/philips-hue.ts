import type { Device } from "@workspace/db";
import type { LightParams } from "../light-engine";

function hexToXY(hex: string): [number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const R = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  const G = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  const B = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  const X = R * 0.664511 + G * 0.154324 + B * 0.162028;
  const Y = R * 0.283881 + G * 0.668433 + B * 0.047685;
  const Z = R * 0.000088 + G * 0.072310 + B * 0.986039;
  if (X + Y + Z === 0) return [0, 0];
  return [
    Math.round((X / (X + Y + Z)) * 10000) / 10000,
    Math.round((Y / (X + Y + Z)) * 10000) / 10000,
  ];
}

async function hueRequest(
  bridgeIp: string,
  apiKey: string,
  path: string,
  method: string,
  body?: object
): Promise<void> {
  const url = `http://${bridgeIp}/api/${apiKey}${path}`;
  await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
}

export async function philipsHueApply(device: Device, params: LightParams): Promise<void> {
  if (!device.bridgeIp || !device.apiKey) throw new Error("Hue requires bridgeIp and apiKey");
  const lightId = device.deviceId ?? "1";
  const bri = Math.round((params.brightness / 100) * 254);
  const [x, y] = hexToXY(params.color);

  const baseState: Record<string, unknown> = { on: true, bri, xy: [x, y], transitiontime: 1 };

  if (params.effect === "strobe") {
    baseState.alert = "lselect";
  } else if (params.effect === "pulse" || params.effect === "fade") {
    baseState.transitiontime = Math.round(params.durationMs / 2 / 100);
  } else if (params.effect === "rainbow") {
    baseState.effect = "colorloop";
  } else if (params.effect === "police") {
    await hueRequest(device.bridgeIp, device.apiKey, `/lights/${lightId}/state`, "PUT", { on: true, xy: hexToXY("#FF0000"), bri, transitiontime: 0 });
    await sleep(300);
    await hueRequest(device.bridgeIp, device.apiKey, `/lights/${lightId}/state`, "PUT", { on: true, xy: hexToXY("#0000FF"), bri, transitiontime: 0 });
    await sleep(300);
    await hueRequest(device.bridgeIp, device.apiKey, `/lights/${lightId}/state`, "PUT", { on: true, xy: hexToXY("#FF0000"), bri, transitiontime: 0 });
    await sleep(300);
    await hueRequest(device.bridgeIp, device.apiKey, `/lights/${lightId}/state`, "PUT", { on: true, xy: hexToXY("#0000FF"), bri, transitiontime: 0 });
    return;
  }

  await hueRequest(device.bridgeIp, device.apiKey, `/lights/${lightId}/state`, "PUT", baseState);
}

export async function philipsHueIdle(device: Device, idleColor: string, idleBrightness: number): Promise<void> {
  if (!device.bridgeIp || !device.apiKey) return;
  const lightId = device.deviceId ?? "1";
  const bri = Math.round((idleBrightness / 100) * 254);
  const [x, y] = hexToXY(idleColor);
  await hueRequest(device.bridgeIp, device.apiKey, `/lights/${lightId}/state`, "PUT", {
    on: true, bri, xy: [x, y], transitiontime: 10, alert: "none", effect: "none",
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
