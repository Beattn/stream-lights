import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, dialog, Notification } from "electron";
import path from "path";
import fs from "fs";
import { agent, type AgentStatus } from "./agent/index";

// ─── Hardcoded defaults — set these before building & distributing ───────────
// The Anon Key is public by design (Supabase calls it "anon/public key").
// Friends who install this app do not need to configure anything.
const DEFAULT_SUPABASE_URL = "https://ylivjdmmmgotyctqbvaa.supabase.co";
const DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlsaXZqZG1tbWdvdHljdHFidmFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjAzMjEsImV4cCI6MjA5NDc5NjMyMX0.YlRRB5kGXXCm03YwOstZd3ZOfDpXAlqhi9SkssHaVBE";
const DEFAULT_DASHBOARD_URL = "https://stream-lights.vercel.app"; // your Vercel URL
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(app.getPath("userData"), "config.json");

interface Config {
  supabaseUrl: string;
  supabaseKey: string;
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
  items.push({
    label: "Settings",
    click: () => openSetupWindow(),
  });
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
    width: 480,
    height: 600,
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

ipcMain.on("get-config", (event) => {
  event.returnValue = config ?? {};
});

ipcMain.on("close-setup", () => {
  if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
});

ipcMain.handle("save-config", async (_event, newConfig: Config) => {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(newConfig.supabaseUrl, newConfig.supabaseKey, { auth: { persistSession: false } });
    const { error } = await sb.from("devices").select("count").limit(1);
    if (error) throw new Error(error.message);

    saveConfig(newConfig);
    config = newConfig;

    await agent.stop();
    await agent.start(newConfig.supabaseUrl, newConfig.supabaseKey, (status) => updateTray(status));
    updateTray();
    notify("Stream Lights", "Agent connected and running!");

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});

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

  // If no saved config, auto-use the hardcoded defaults — no setup screen needed.
  if (!config) {
    if (DEFAULT_SUPABASE_URL && DEFAULT_SUPABASE_URL !== "https://ylivjdmmmgotyctqbvaa.supabase.co") {
      config = {
        supabaseUrl: DEFAULT_SUPABASE_URL,
        supabaseKey: DEFAULT_SUPABASE_KEY,
        dashboardUrl: DEFAULT_DASHBOARD_URL,
      };
      saveConfig(config);
    } else {
      // Defaults not filled in yet — show setup so the developer can configure
      openSetupWindow();
      updateTray();
      return;
    }
  }

  try {
    await agent.start(config.supabaseUrl, config.supabaseKey, (status) => updateTray(status));
    notify("Stream Lights", "Agent started — controlling your lights!");
  } catch (err) {
    console.error("[Main] Agent start failed:", err);
    updateTray();
    openSetupWindow();
  }
});

app.on("window-all-closed", () => { /* keep running in tray */ });
app.on("before-quit", () => agent.stop());
