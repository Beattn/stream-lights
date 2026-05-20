export interface Device {
  id: number;
  name: string;
  type: string;
  bridgeIp: string | null;
  apiKey: string | null;
  deviceId: string | null;
  enabled: boolean;
  brightness: number | null;
}

export interface LightParams {
  color: string;
  brightness: number;
  effect: string;
  durationMs: number;
  audioUrl?: string;
  audioVolume?: number;
}

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
  return [Math.round((X / (X + Y + Z)) * 10000) / 10000, Math.round((Y / (X + Y + Z)) * 10000) / 10000];
}

function hexToHSV(hex: string): { h: number; s: number; v: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: Math.round((h * 60 + 360) % 360), s: max === 0 ? 0 : Math.round((d / max) * 100), v: Math.round(max * 100) };
}

function hexToRgb(hex: string) {
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}

async function hueSet(ip: string, key: string, lightId: string, body: object) {
  await fetch(`http://${ip}/api/${key}/lights/${lightId}/state`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
  });
}

async function nanoleafSet(ip: string, token: string, body: object) {
  await fetch(`http://${ip}:16021/api/v1/${token}/state`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
  });
}

async function lifxSet(key: string, selector: string, body: object) {
  await fetch(`https://api.lifx.com/v1/lights/${selector}/state`, {
    method: "PUT", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
  });
}

async function goveeSet(key: string, device: string, model: string, cmd: object) {
  await fetch("https://developer-api.govee.com/v1/devices/control", {
    method: "PUT", headers: { "Govee-API-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ device, model, cmd }), signal: AbortSignal.timeout(8000),
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function applyLight(device: Device, params: LightParams): Promise<void> {
  const bri = params.brightness;

  if (device.type === "philips_hue" && device.bridgeIp && device.apiKey) {
    const lightId = device.deviceId ?? "1";
    const [x, y] = hexToXY(params.color);
    const hueBri = Math.round((bri / 100) * 254);

    if (params.effect === "strobe") {
      await hueSet(device.bridgeIp, device.apiKey, lightId, { on: true, bri: hueBri, xy: [x, y], alert: "lselect" });
    } else if (params.effect === "rainbow") {
      await hueSet(device.bridgeIp, device.apiKey, lightId, { on: true, effect: "colorloop", bri: hueBri });
    } else if (params.effect === "police") {
      for (let i = 0; i < 3; i++) {
        await hueSet(device.bridgeIp, device.apiKey, lightId, { on: true, xy: hexToXY("#FF0000"), bri: hueBri, transitiontime: 0 });
        await sleep(300);
        await hueSet(device.bridgeIp, device.apiKey, lightId, { on: true, xy: hexToXY("#0000FF"), bri: hueBri, transitiontime: 0 });
        await sleep(300);
      }
    } else if (params.effect === "pulse") {
      await hueSet(device.bridgeIp, device.apiKey, lightId, { on: true, bri: hueBri, xy: [x, y], alert: "select" });
    } else {
      await hueSet(device.bridgeIp, device.apiKey, lightId, { on: true, bri: hueBri, xy: [x, y], transitiontime: 1, alert: "none", effect: "none" });
    }
  }

  else if (device.type === "nanoleaf" && device.bridgeIp && device.apiKey) {
    const { h, s } = hexToHSV(params.color);
    if (params.effect === "rainbow") {
      await nanoleafSet(device.bridgeIp, device.apiKey, { select: "Color Burst" });
    } else if (params.effect === "strobe") {
      await nanoleafSet(device.bridgeIp, device.apiKey, { select: "Strobe" });
    } else {
      await nanoleafSet(device.bridgeIp, device.apiKey, {
        on: { value: true }, hue: { value: h }, sat: { value: s }, brightness: { value: bri },
      });
    }
  }

  else if (device.type === "lifx" && device.apiKey) {
    const selector = device.deviceId ? `id:${device.deviceId}` : "all";
    await lifxSet(device.apiKey, selector, {
      color: `hex:${params.color.replace("#", "")}`,
      brightness: bri / 100, duration: 0.1, power: "on",
    });
  }

  else if (device.type === "govee" && device.apiKey && device.deviceId) {
    const idx = device.deviceId.indexOf(":");
    if (idx !== -1) {
      const model = device.deviceId.slice(0, idx);
      const mac = device.deviceId.slice(idx + 1);
      const { r, g, b } = hexToRgb(params.color);
      await goveeSet(device.apiKey, mac, model, { name: "color", value: { r, g, b } });
      await goveeSet(device.apiKey, mac, model, { name: "brightness", value: bri });
    }
  }

  else if (device.type === "generic_http" && device.bridgeIp) {
    const { r, g, b } = hexToRgb(params.color);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (device.apiKey) headers["Authorization"] = `Bearer ${device.apiKey}`;
    await fetch(device.bridgeIp, {
      method: "POST", headers,
      body: JSON.stringify({ color: params.color, r, g, b, brightness: bri, effect: params.effect, durationMs: params.durationMs }),
      signal: AbortSignal.timeout(8000),
    });
  }
}

export async function applyIdle(device: Device, idleColor: string, idleBrightness: number): Promise<void> {
  if (device.type === "philips_hue" && device.bridgeIp && device.apiKey) {
    const [x, y] = hexToXY(idleColor);
    await hueSet(device.bridgeIp, device.apiKey, device.deviceId ?? "1", {
      on: true, bri: Math.round((idleBrightness / 100) * 254), xy: [x, y], transitiontime: 10, alert: "none", effect: "none",
    });
  } else if (device.type === "nanoleaf" && device.bridgeIp && device.apiKey) {
    const { h, s } = hexToHSV(idleColor);
    await nanoleafSet(device.bridgeIp, device.apiKey, { on: { value: true }, hue: { value: h }, sat: { value: s }, brightness: { value: idleBrightness } });
  } else {
    await applyLight(device, { color: idleColor, brightness: idleBrightness, effect: "solid", durationMs: 0 });
  }
}
