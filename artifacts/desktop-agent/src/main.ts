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

// ─── Single instance lock ──────────────────────────────────────────────────────
// This MUST be the first thing after imports — prevents multiple subprocesses
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // Another instance is already running — quit immediately
  app.quit();
  process.exit(0);
}

// ─── Hardcoded Supabase connection ─────────────────────────────────────────────
const SUPABASE_URL = "https://ylivjdmmmgotyctqbvaa.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsaXZqZG1tbWdvdHljdHFidmFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjAzMjEsImV4cCI6MjA5NDc5NjMyMX0.YlRRB5kGXXCm03YwOstZd3ZOfDpXAlqhi9SkssHaVBE";
const DEFAULT_DASHBOARD_URL = "https://stream-lights.vercel.app";
// ──────────────────────────────────────────────────────────────────────────────

let CONFIG_PATH: string;

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

      const nx = (x / size - 0.5) * 2.4;
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
  ihdr[8] = 8; ihdr[9] = 6;

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

// ─── Pre-build ALL icons once at startup (no CPU cost on each status update) ──
const iconCache = new Map<string, Electron.NativeImage>();

function getIcon(color: keyof typeof ICON_COLORS = "gray"): Electron.NativeImage {
  const key = String(color);
  let icon = iconCache.get(key);
  if (!icon) {
    const [r, g, b] = ICON_COLORS[key] ?? ICON_COLORS.gray;
    icon = nativeImage.createFromBuffer(buildPNG(32, r, g, b));
    iconCache.set(key, icon);
  }
  return icon;
}

function makeAppIcon(): Electron.NativeImage {
  let icon = iconCache.get("app-purple");
  if (!icon) {
    const [r, g, b] = ICON_COLORS.purple;
    icon = nativeImage.createFromBuffer(buildPNG(256, r, g, b));
    iconCache.set("app-purple", icon);
  }
  return icon;
}

let tray: Tray | null = null;
let setupWindow: BrowserWindow | null = null;
let dashboardWindow: BrowserWindow | null = null;
let currentStatus: AgentStatus | null = null;
let config: Config | null = null;
let lastTrayColor: string | null = null;

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

  // Only update the icon image when color actually changes — avoids redundant GPU work
  if (color !== lastTrayColor) {
    tray.setImage(getIcon(color));
    lastTrayColor = color;
  }

  tray.setToolTip(`Stream Lights${s?.kickConnected ? " — Kick ✓" : ""}${s?.twitchConnected ? " — Twitch ✓" : ""}`);
  tray.setContextMenu(buildTrayMenu());
}

// ─── Setup window ─────────────────────────────────────────────────────────────
function openSetupWindow(): void {
  // If already open, just focus it — never create a second window
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.show();
    setupWindow.focus();
    return;
  }

  setupWindow = new BrowserWindow({
    width: 460,
    height: 650,
    minWidth: 400,
    minHeight: 540,
    resizable: false,
    frame: false,
    hasShadow: true,
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
        email:          config.email,
        dashboardUrl:   config.dashboardUrl,
        isConnected:    s?.running       ?? false,
        kickConnected:  s?.kickConnected   ?? false,
        twitchConnected:s?.twitchConnected ?? false,
        devicesCount:   s?.devicesCount   ?? 0,
        triggersCount:  s?.triggersCount  ?? 0,
      }
    : { isConnected: false, kickConnected: false, twitchConnected: false, devicesCount: 0, triggersCount: 0 };
});

ipcMain.handle("test-light", async (_event, params: { color: string; brightness: number; effect: string; durationMs: number }) => {
  try {
    await agent.testLight(params.color, params.brightness, params.effect, params.durationMs);
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});

ipcMain.on("close-setup", () => {
  if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
});

ipcMain.on("minimize-window", () => {
  if (setupWindow && !setupWindow.isDestroyed()) setupWindow.minimize();
});

ipcMain.on("maximize-window", () => {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.isMaximized() ? setupWindow.unmaximize() : setupWindow.maximize();
  }
});

// Opens the dashboard from the Settings window and closes Settings
ipcMain.on("open-dashboard", () => {
  if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
  openDashboardWindow();
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
  // Defer CONFIG_PATH until after app is ready
  CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

  app.setAppUserModelId("Stream Lights");

  if (process.platform === "darwin") app.dock.hide();

  // Pre-build all icons now so they're ready instantly
  for (const color of Object.keys(ICON_COLORS)) getIcon(color);

  tray = new Tray(getIcon("gray"));
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

// ─── Second-instance handler ───────────────────────────────────────────────────
// When Windows tries to launch a second copy of the app, focus the existing one
app.on("second-instance", () => {
  if (setupWindow && !setupWindow.isDestroyed()) {
    if (setupWindow.isMinimized()) setupWindow.restore();
    setupWindow.show();
    setupWindow.focus();
  } else if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    if (dashboardWindow.isMinimized()) dashboardWindow.restore();
    dashboardWindow.show();
    dashboardWindow.focus();
  }
});

app.on("window-all-closed", () => { /* keep running in tray */ });

// Properly await agent cleanup before the process exits
// Without this, timers and WebSockets can linger briefly after quit
let isQuitting = false;
app.on("before-quit", (e) => {
  if (isQuitting) return;
  isQuitting = true;
  e.preventDefault();
  agent.stop()
    .catch(() => { /* ignore errors during shutdown */ })
    .finally(() => app.exit(0));
});

app.on("activate", () => openDashboardWindow());
