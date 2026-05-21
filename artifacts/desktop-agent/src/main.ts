// Polyfill WebSocket for Node.js < 22 before any Supabase client is created
import { WebSocket as WsWebSocket } from "ws";
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as unknown as Record<string, unknown>).WebSocket = WsWebSocket;
}

import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, dialog, Notification } from "electron";
import path from "path";
import fs from "fs";
import { deflateSync } from "zlib";
import { agent, type AgentStatus } from "./agent/index";

// ─── Hardcoded Supabase connection ─────────────────────────────────────────────
const SUPABASE_URL = "https://ylivjdmmmgotyctqbvaa.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsaXZqZG1tbWdvdHljdHFidmFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjAzMjEsImV4cCI6MjA5NDc5NjMyMX0.YlRRB5kGXXCm03YwOstZd3ZOfDpXAlqhi9SkssHaVBE";
const DEFAULT_DASHBOARD_URL = "https://stream-lights.vercel.app";
// ──────────────────────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

interface Config {
  email: string;
  password: string;
  dashboardUrl: string;
}

function loadConfig(): Config | null {
  try {
    if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) as Config;
  } catch { /* ignore */ }
  return null;
}

function saveConfig(config: Config): void {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ─── PNG icon generator (no external deps, works on Windows) ─────────────────
function buildPNG(size: number, r: number, g: number, b: number): Buffer {
  function crc32(buf: Buffer): number {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c;
    }
    let crc = 0xffffffff;
    for (const byte of buf) crc = t[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (~crc) >>> 0;
  }
  function chunk(type: string, data: Buffer): Buffer {
    const tb = Buffer.from(type);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([tb, data])));
    return Buffer.concat([len, tb, data, crcBuf]);
  }

  const pixels = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2, radius = size / 2 - 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5, dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const alpha = Math.max(0, Math.min(1, radius - dist + 1));

      // Lightning bolt shape (normalised 0-1 coords within circle)
      const nx = (x / size - 0.5) * 2.4;  // -1.2 to 1.2
      const ny = (y / size - 0.5) * 2.4;
      const bolt =
        (ny < 0.1  && nx >= -0.55 && nx <= 0.1  && ny >= -1.1) ||
        (ny >= 0.1 && nx >= -0.1  && nx <= 0.55 && ny <= 1.1);

      const idx = (y * size + x) * 4;
      pixels[idx]     = bolt ? 255 : r;
      pixels[idx + 1] = bolt ? 255 : g;
      pixels[idx + 2] = bolt ? 255 : b;
      pixels[idx + 3] = Math.round(alpha * 255);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  const raw: number[] = [];
  for (let y = 0; y < size; y++) {
    raw.push(0);
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      raw.push(pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]);
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.from(raw))), chunk("IEND", Buffer.alloc(0))]);
}

const ICON_COLORS: Record<string, [number, number, number]> = {
  green:  [34,  197, 94],
  yellow: [234, 179, 8],
  red:    [239, 68,  68],
  gray:   [100, 116, 139],
  purple: [139, 92,  246],
};

function makeIcon(color: keyof typeof ICON_COLORS = "gray"): Electron.NativeImage {
  const [r, g, b] = ICON_COLORS[color] ?? ICON_COLORS.gray;
  return nativeImage.createFromBuffer(buildPNG(32, r, g, b));
}

// App icon for windows (larger, purple)
function makeAppIcon(): Electron.NativeImage {
  const [r, g, b] = ICON_COLORS.purple;
  return nativeImage.createFromBuffer(buildPNG(256, r, g, b));
}

let tray: Tray | null = null;
let setupWindow: BrowserWindow | null = null;
let dashboardWindow: BrowserWindow | null = null;
let currentStatus: AgentStatus | null = null;
let config: Config | null = null;
const appIcon = (() => { try { return makeAppIcon(); } catch { return undefined; } })();

// ─── Dashboard window ─────────────────────────────────────────────────────────
function openDashboardWindow(urlOverride?: string): void {
  const url = urlOverride ?? config?.dashboardUrl ?? DEFAULT_DASHBOARD_URL;

  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    if (urlOverride) dashboardWindow.loadURL(url);
    dashboardWindow.show();
    dashboardWindow.focus();
    return;
  }

  dashboardWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Stream Lights",
    icon: appIcon,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  dashboardWindow.loadURL(url);

  dashboardWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    if (!openUrl.startsWith(url)) {
      shell.openExternal(openUrl);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  dashboardWindow.on("closed", () => { dashboardWindow = null; });
}

// ─── Tray ─────────────────────────────────────────────────────────────────────
function buildTrayMenu(): Electron.Menu {
  const s = currentStatus;
  const items: Electron.MenuItemConstructorOptions[] = [
    { label: "⚡ Stream Lights", enabled: false },
    { type: "separator" },
  ];

  if (s) {
    items.push({ label: s.running ? "● Agent running" : "○ Agent stopped", enabled: false });
    items.push({ label: `Kick: ${s.kickConnected ? "✓" : "✗"}   Twitch: ${s.twitchConnected ? "✓" : "✗"}`, enabled: false });
    items.push({ label: `Devices: ${s.devicesCount}   Triggers: ${s.triggersCount}`, enabled: false });
    if (s.lastEvent) items.push({ label: `Last: ${s.lastEvent.slice(0, 40)}`, enabled: false });
    if (s.errors.length > 0) items.push({ label: `⚠ ${s.errors[s.errors.length - 1]?.slice(0, 40)}`, enabled: false });
  }

  items.push({ type: "separator" });
  items.push({ label: "Open Dashboard", click: () => openDashboardWindow() });
  items.push({ type: "separator" });

  items.push({
    label: "Test Lights (red flash)",
    click: async () => {
      try {
        await agent.testLight("#FF0000", 100, "solid", 2000);
      } catch (err) {
        dialog.showErrorBox("Test failed", (err as Error).message);
      }
    },
  });

  items.push({ type: "separator" });
  items.push({ label: "Settings", click: () => openSetupWindow() });
  items.push({ type: "separator" });
  items.push({ label: "Quit", click: () => { agent.stop(); app.quit(); } });

  return Menu.buildFromTemplate(items);
}

function updateTray(status?: AgentStatus): void {
  if (!tray) return;
  if (status) currentStatus = status;

  const s = currentStatus;
  let color: keyof typeof ICON_COLORS = "gray";
  if (s?.running) {
    if (s.kickConnected || s.twitchConnected) color = "green";
    else if (s.errors.length > 0) color = "red";
    else color = "yellow";
  }

  tray.setImage(makeIcon(color));
  tray.setToolTip(`Stream Lights${s?.kickConnected ? " — Kick ✓" : ""}${s?.twitchConnected ? " — Twitch ✓" : ""}`);
  tray.setContextMenu(buildTrayMenu());
}

// ─── Setup window ─────────────────────────────────────────────────────────────
function openSetupWindow(): void {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.focus();
    return;
  }

  setupWindow = new BrowserWindow({
    width: 460,
    height: 600,
    minWidth: 400,
    minHeight: 520,
    resizable: true,
    title: "Stream Lights — Settings",
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  setupWindow.loadFile(path.join(__dirname, "..", "setup.html"));
  setupWindow.on("closed", () => { setupWindow = null; });
}

function notify(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body, silent: true }).show();
  }
}

// ─── IPC ──────────────────────────────────────────────────────────────────────
ipcMain.on("get-config", (event) => {
  const s = currentStatus;
  event.returnValue = config
    ? {
        email: config.email,
        dashboardUrl: config.dashboardUrl,
        isConnected: s?.running ?? false,
        kickConnected: s?.kickConnected ?? false,
      }
    : { isConnected: false, kickConnected: false };
});

ipcMain.on("close-setup", () => {
  if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
});

ipcMain.handle("save-config", async (_event, newConfig: Config) => {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

    const { data: signInData, error: authError } = await sb.auth.signInWithPassword({
      email: newConfig.email,
      password: newConfig.password,
    });
    if (authError) throw new Error(authError.message);

    const saved: Config = {
      email: newConfig.email,
      password: newConfig.password,
      dashboardUrl: newConfig.dashboardUrl || DEFAULT_DASHBOARD_URL,
    };

    saveConfig(saved);
    config = saved;

    await agent.stop();
    await agent.start(SUPABASE_URL, SUPABASE_KEY, (status) => updateTray(status));
    updateTray();
    notify("Stream Lights", "Agent connected and running!");

    const dashBase = saved.dashboardUrl;
    const session = signInData?.session;
    const dashUrl = session
      ? `${dashBase}#access_token=${session.access_token}&refresh_token=${session.refresh_token}&type=login`
      : dashBase;

    if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
    openDashboardWindow(dashUrl);

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});

// ─── Start with saved credentials ─────────────────────────────────────────────
async function startWithSavedConfig(cfg: Config): Promise<string | null> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

    const { data: signInData, error: authError } = await sb.auth.signInWithPassword({
      email: cfg.email,
      password: cfg.password,
    });
    if (authError) throw new Error(authError.message);

    await agent.start(SUPABASE_URL, SUPABASE_KEY, (status) => updateTray(status));

    const dashBase = cfg.dashboardUrl || DEFAULT_DASHBOARD_URL;
    const session = signInData?.session;
    return session
      ? `${dashBase}#access_token=${session.access_token}&refresh_token=${session.refresh_token}&type=login`
      : dashBase;
  } catch {
    return null;
  }
}

// ─── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  app.setAppUserModelId("Stream Lights");

  if (process.platform === "darwin") app.dock.hide();

  tray = new Tray(makeIcon("gray"));
  tray.setToolTip("Stream Lights — starting...");
  tray.setContextMenu(buildTrayMenu());

  tray.on("double-click", () => openDashboardWindow());

  config = loadConfig();

  if (config?.email && config?.password) {
    const dashUrl = await startWithSavedConfig(config);
    if (dashUrl) {
      notify("Stream Lights", "Agent started — controlling your lights!");
      updateTray();
      openDashboardWindow(dashUrl);
    } else {
      console.error("[Main] Saved credentials rejected, opening setup.");
      updateTray();
      openSetupWindow();
    }
  } else {
    openSetupWindow();
    updateTray();
  }
});

app.on("window-all-closed", () => { /* keep running in tray */ });
app.on("before-quit", () => agent.stop());
app.on("activate", () => openDashboardWindow());
