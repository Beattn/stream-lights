import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, dialog, Notification } from "electron";
import path from "path";
import fs from "fs";
import { agent, type AgentStatus } from "./agent/index";

// ─── Hardcoded Supabase connection — pre-filled so users never need to enter it ─
const SUPABASE_URL = "https://ylivjdmmmgotyctqbvaa.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsaXZqZG1tbWdvdHljdHFidmFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjAzMjEsImV4cCI6MjA5NDc5NjMyMX0.YlRRB5kGXXCm03YwOstZd3ZOfDpXAlqhi9SkssHaVBE";
const DEFAULT_DASHBOARD_URL = "https://stream-lights.vercel.app";
// ─────────────────────────────────────────────────────────────────────────────

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

function makeIcon(color: "green" | "yellow" | "red" | "gray"): Electron.NativeImage {
  const colors = { green: "#22c55e", yellow: "#eab308", red: "#ef4444", gray: "#64748b" };
  const fill = colors[color];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">
    <circle cx="8" cy="8" r="7" fill="${fill}"/>
    <text x="8" y="12" text-anchor="middle" font-size="9" fill="white" font-family="Arial">⚡</text>
  </svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

let tray: Tray | null = null;
let setupWindow: BrowserWindow | null = null;
let currentStatus: AgentStatus | null = null;
let config: Config | null = null;

function buildTrayMenu(): Electron.Menu {
  const s = currentStatus;
  const items: Electron.MenuItemConstructorOptions[] = [
    { label: "⚡ Stream Lights Agent", enabled: false },
    { type: "separator" },
  ];

  if (s) {
    items.push({ label: s.running ? "● Running" : "○ Stopped", enabled: false });
    items.push({ label: `Kick: ${s.kickConnected ? "✓ Connected" : "✗ Disconnected"}`, enabled: false });
    items.push({ label: `Twitch: ${s.twitchConnected ? "✓ Connected" : "✗ Disconnected"}`, enabled: false });
    items.push({ label: `Devices: ${s.devicesCount} | Triggers: ${s.triggersCount}`, enabled: false });
    if (s.lastEvent) items.push({ label: `Last: ${s.lastEvent.slice(0, 40)}`, enabled: false });
    if (s.errors.length > 0) items.push({ label: `⚠ ${s.errors[s.errors.length - 1]?.slice(0, 40)}`, enabled: false });
  }

  items.push({ type: "separator" });

  if (config?.dashboardUrl) {
    items.push({ label: "Open Dashboard", click: () => shell.openExternal(config!.dashboardUrl) });
  }

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
  let color: "green" | "yellow" | "red" | "gray" = "gray";
  if (s?.running) {
    if (s.kickConnected || s.twitchConnected) color = "green";
    else if (s.errors.length > 0) color = "red";
    else color = "yellow";
  }

  tray.setImage(makeIcon(color));
  tray.setToolTip(`Stream Lights Agent${s?.kickConnected ? " — Kick ✓" : ""}${s?.twitchConnected ? " — Twitch ✓" : ""}`);
  tray.setContextMenu(buildTrayMenu());
}

function openSetupWindow(): void {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.focus();
    return;
  }

  setupWindow = new BrowserWindow({
    width: 460,
    height: 560,
    resizable: false,
    frame: false,
    transparent: true,
    title: "Stream Lights Agent",
    icon: makeIcon("green"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hidden",
    vibrancy: "dark",
    backgroundMaterial: "acrylic",
  });

  setupWindow.loadFile(path.join(__dirname, "..", "setup.html"));
  setupWindow.on("closed", () => { setupWindow = null; });
}

function notify(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body, silent: true }).show();
  }
}

// Return only safe fields to the renderer (never send password back)
ipcMain.on("get-config", (event) => {
  event.returnValue = config ? { email: config.email, dashboardUrl: config.dashboardUrl } : {};
});

ipcMain.on("close-setup", () => {
  if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
});

ipcMain.handle("save-config", async (_event, newConfig: Config) => {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

    // Authenticate with email + password
    const { error: authError } = await sb.auth.signInWithPassword({
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

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});

async function startWithSavedConfig(cfg: Config): Promise<boolean> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

    const { error: authError } = await sb.auth.signInWithPassword({
      email: cfg.email,
      password: cfg.password,
    });
    if (authError) throw new Error(authError.message);

    await agent.start(SUPABASE_URL, SUPABASE_KEY, (status) => updateTray(status));
    return true;
  } catch {
    return false;
  }
}

app.whenReady().then(async () => {
  app.setAppUserModelId("Stream Lights Agent");

  if (process.platform === "darwin") app.dock.hide();

  tray = new Tray(makeIcon("gray"));
  tray.setToolTip("Stream Lights Agent — starting...");
  tray.setContextMenu(buildTrayMenu());
  tray.on("double-click", () => {
    if (config?.dashboardUrl) shell.openExternal(config.dashboardUrl);
    else openSetupWindow();
  });

  config = loadConfig();

  if (config?.email && config?.password) {
    const ok = await startWithSavedConfig(config);
    if (ok) {
      notify("Stream Lights", "Agent started — controlling your lights!");
    } else {
      // Saved credentials no longer valid — ask user to sign in again
      console.error("[Main] Saved credentials rejected, opening setup.");
      updateTray();
      openSetupWindow();
    }
  } else {
    // No saved credentials — show sign-in screen
    openSetupWindow();
    updateTray();
  }
});

app.on("window-all-closed", () => { /* keep running in tray */ });
app.on("before-quit", () => agent.stop());
