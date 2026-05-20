import type { Device } from "@workspace/db";
import type { LightParams } from "../light-engine.js";

function hexToHSV(hex: string): { h: number; s: number; v: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = Math.round((h * 60 + 360) % 360);
  const s = max === 0 ? 0 : Math.round((d / max) * 100);
  const v = Math.round(max * 100);
  return { h, s, v };
}

async function nanoleafRequest(ip: string, token: string, path: string, method: string, body?: object): Promise<void> {
  await fetch(`http://${ip}:16021/api/v1/${token}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
}

export async function nanoleafApply(device: Device, params: LightParams): Promise<void> {
  if (!device.bridgeIp || !device.apiKey) throw new Error("Nanoleaf requires bridgeIp and apiKey");
  const { h, s } = hexToHSV(params.color);

  if (params.effect === "rainbow") {
    await nanoleafRequest(device.bridgeIp, device.apiKey, "/effects", "PUT", { select: "Color Burst" });
    return;
  }
  if (params.effect === "strobe") {
    await nanoleafRequest(device.bridgeIp, device.apiKey, "/effects", "PUT", { select: "Strobe" });
    return;
  }
  if (params.effect === "police") {
    const policeEffect = {
      write: {
        command: "display",
        animType: "highlight",
        animData: "2 0 1 255 0 0 0 10 1 0 0 255 0 10",
        loop: true,
        palette: [{ hue: 0, saturation: 100, brightness: 100 }, { hue: 240, saturation: 100, brightness: 100 }],
      },
    };
    await nanoleafRequest(device.bridgeIp, device.apiKey, "/effects", "PUT", policeEffect);
    return;
  }

  await nanoleafRequest(device.bridgeIp, device.apiKey, "/state", "PUT", {
    on: { value: true },
    hue: { value: h },
    sat: { value: s },
    brightness: { value: params.brightness },
  });
}

export async function nanoleafIdle(device: Device, idleColor: string, idleBrightness: number): Promise<void> {
  if (!device.bridgeIp || !device.apiKey) return;
  const { h, s } = hexToHSV(idleColor);
  await nanoleafRequest(device.bridgeIp, device.apiKey, "/state", "PUT", {
    on: { value: true },
    hue: { value: h },
    sat: { value: s },
    brightness: { value: idleBrightness },
  });
}
