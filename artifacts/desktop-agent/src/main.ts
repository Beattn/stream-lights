import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell, dialog, Notification } from "electron";
import path from "path";
import fs from "fs";
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
let dashboardWindow: BrowserWindow | null = null;
let currentStatus: AgentStatus | null = null;
let config: Config | null = null;

// ─── Dashboard window ─────────────────────────────────────────────────────────
function openDashboardWindow(): void {
  const url = config?.dashboardUrl || DEFAULT_DASHBOARD_URL;

  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
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
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  dashboardWindow.loadURL(url);

  // Open external links (docs, OAuth popups, etc.) in default browser
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
  let color: "green" | "yellow" | "red" | "gray" = "gray";
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
    height: 560,
    resizable: false,
    frame: false,
    transparent: true,
    title: "Stream Lights — Sign In",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hidden",
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

// ─── IPC ──────────────────────────────────────────────────────────────────────
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

    // Open the dashboard after signing in
    if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
    openDashboardWindow();

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
});

// ─── Start with saved credentials ─────────────────────────────────────────────
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

// ─── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  app.setAppUserModelId("Stream Lights");

  if (process.platform === "darwin") app.dock.hide();

  tray = new Tray(makeIcon("gray"));
  tray.setToolTip("Stream Lights — starting...");
  tray.setContextMenu(buildTrayMenu());

  // Double-click tray icon → open dashboard
  tray.on("double-click", () => openDashboardWindow());

  config = loadConfig();

  if (config?.email && config?.password) {
    const ok = await startWithSavedConfig(config);
    if (ok) {
      notify("Stream Lights", "Agent started — controlling your lights!");
      updateTray();
      // Auto-open the dashboard on launch
      openDashboardWindow();
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

app.on("window-all-closed", () => { /* keep running in tray even if all windows closed */ });
app.on("before-quit", () => agent.stop());
app.on("activate", () => openDashboardWindow()); // macOS dock click
