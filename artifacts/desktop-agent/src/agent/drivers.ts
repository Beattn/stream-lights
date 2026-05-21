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

export interface EffectStep {
  color: string;
  durationMs: number;
  brightness?: number;
}

export interface LightParams {
  color: string;
  brightness: number;
  effect: string;
  durationMs: number;
  audioUrl?: string;
  audioVolume?: number;
  audioStartMs?: number | null;
  audioEndMs?: number | null;
  customSteps?: EffectStep[];
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

const GOVEE_TIMEOUT_MS = 5000;
const HUE_TIMEOUT_MS = 5000;
const LIFX_TIMEOUT_MS = 5000;

// Govee HTTP API allows ~10 requests per device per minute.
// We throttle at the alert level (not per-command) so effects like strobe
// can still fire multiple rapid calls within one alert, while preventing
// separate alerts from hammering the API. 6s = 10 alerts/min max.
const GOVEE_ALERT_INTERVAL_MS = 6000;
const goveeLastAlert = new Map<string, number>();

async function goveeSet(key: string, device: string, model: string, cmd: object) {
  const res = await fetch("https://developer-api.govee.com/v1/devices/control", {
    method: "PUT", headers: { "Govee-API-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ device, model, cmd }), signal: AbortSignal.timeout(GOVEE_TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Govee API error ${res.status}: ${text}`);
  }
}

async function hueSet(ip: string, key: string, lightId: string, body: object) {
  await fetch(`http://${ip}/api/${key}/lights/${lightId}/state`, {
    method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(HUE_TIMEOUT_MS),
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
    body: JSON.stringify(body), signal: AbortSignal.timeout(LIFX_TIMEOUT_MS),
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function applyLight(device: Device, params: LightParams): Promise<void> {
  if (params.effect === "custom" && params.customSteps && params.customSteps.length > 0) {
    for (const step of params.customSteps) {
      const stepEffect = (step as { effect?: string }).effect ?? "solid";
      await applyLight(device, {
        ...params,
        color: step.color,
        brightness: step.brightness ?? params.brightness,
        effect: stepEffect,
        durationMs: step.durationMs,
      });
      const loopingEffects = new Set(["wave", "breathe", "custom"]);
      if (!loopingEffects.has(stepEffect)) {
        await sleep(step.durationMs);
      }
    }
    return;
  }

  const bri = params.brightness;

  if (device.type === "philips_hue" && device.bridgeIp && device.apiKey) {
    const lightId = device.deviceId ?? "1";
    const [x, y] = hexToXY(params.color);
    const hueBri = Math.round((bri / 100) * 254);

    if (params.effect === "strobe" || params.effect === "twinkle") {
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
    } else if (params.effect === "pulse" || params.effect === "breathe" || params.effect === "scanner") {
      await hueSet(device.bridgeIp, device.apiKey, lightId, { on: true, bri: hueBri, xy: [x, y], alert: "select" });
    } else if (params.effect === "explosion") {
      await hueSet(device.bridgeIp, device.apiKey, lightId, { on: true, bri: 254, xy: [x, y], transitiontime: 0 });
      await sleep(150);
      await hueSet(device.bridgeIp, device.apiKey, lightId, { on: true, bri: Math.round(hueBri * 0.2), xy: [x, y], transitiontime: 8 });
    } else if (params.effect === "wave" || params.effect === "flash") {
      const cycleDuration = 800;
      const cycles = Math.max(1, Math.round(params.durationMs / cycleDuration));
      const halfCycle = cycleDuration / 2;
      const minBri = Math.max(1, Math.round(hueBri * 0.1));
      const transHalf = Math.round(halfCycle / 100);
      for (let i = 0; i < cycles; i++) {
        await hueSet(device.bridgeIp, device.apiKey, lightId, { on: true, bri: minBri, xy: [x, y], transitiontime: transHalf });
        await sleep(halfCycle);
        await hueSet(device.bridgeIp, device.apiKey, lightId, { on: true, bri: hueBri, xy: [x, y], transitiontime: transHalf });
        await sleep(halfCycle);
      }
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
    } else if (params.effect === "twinkle") {
      await nanoleafSet(device.bridgeIp, device.apiKey, { select: "Twinkle" });
    } else if (params.effect === "breathe" || params.effect === "wave") {
      await nanoleafSet(device.bridgeIp, device.apiKey, { select: "Northern Lights" });
    } else if (params.effect === "explosion") {
      await nanoleafSet(device.bridgeIp, device.apiKey, { select: "Burst" });
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

      // Alert-level rate limit: skip if too soon since last alert for this device.
      // This lets effects (strobe, police) fire many calls within one alert freely,
      // while preventing separate back-to-back alerts from exceeding Govee's API limit.
      const alertKey = `${device.apiKey}:${mac}`;
      const now = Date.now();
      const lastAlert = goveeLastAlert.get(alertKey) ?? 0;
      if (now - lastAlert < GOVEE_ALERT_INTERVAL_MS) {
        console.warn(`[Govee] Rate limited — skipping alert for device ${mac}`);
        return;
      }
      goveeLastAlert.set(alertKey, now);

      const { r, g, b } = hexToRgb(params.color);

      if (params.effect === "strobe") {
        // Strobe: alternate on/off — fire pairs in parallel, API latency provides natural pacing
        for (let i = 0; i < 5; i++) {
          await goveeSet(device.apiKey, mac, model, { name: "brightness", value: 100 });
          await sleep(120);
          await goveeSet(device.apiKey, mac, model, { name: "brightness", value: 0 });
          await sleep(120);
        }
        // Restore color and brightness at the end
        await Promise.all([
          goveeSet(device.apiKey, mac, model, { name: "color", value: { r, g, b } }),
          goveeSet(device.apiKey, mac, model, { name: "brightness", value: bri }),
        ]);
      } else if (params.effect === "police") {
        for (let i = 0; i < 4; i++) {
          await goveeSet(device.apiKey, mac, model, { name: "color", value: { r: 255, g: 0, b: 0 } });
          await sleep(250);
          await goveeSet(device.apiKey, mac, model, { name: "color", value: { r: 0, g: 0, b: 255 } });
          await sleep(250);
        }
      } else if (params.effect === "rainbow") {
        const colors = [
          { r: 255, g: 0, b: 0 }, { r: 255, g: 127, b: 0 }, { r: 255, g: 255, b: 0 },
          { r: 0, g: 255, b: 0 }, { r: 0, g: 0, b: 255 }, { r: 139, g: 0, b: 255 },
        ];
        const delay = Math.max(200, params.durationMs / colors.length);
        for (const c of colors) {
          await goveeSet(device.apiKey, mac, model, { name: "color", value: c });
          await sleep(delay);
        }
      } else {
        // Solid / pulse / fade / any other — fire color + brightness in parallel for instant response
        await Promise.all([
          goveeSet(device.apiKey, mac, model, { name: "color", value: { r, g, b } }),
          goveeSet(device.apiKey, mac, model, { name: "brightness", value: bri }),
        ]);
      }
    }
  }

  else if (device.type === "generic_http" && device.bridgeIp) {
    const { r, g, b } = hexToRgb(params.color);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (device.apiKey) headers["Authorization"] = `Bearer ${device.apiKey}`;
    await fetch(device.bridgeIp, {
      method: "POST", headers,
      body: JSON.stringify({ color: params.color, r, g, b, brightness: bri, effect: params.effect, durationMs: params.durationMs }),
      signal: AbortSignal.timeout(5000),
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
