import http from "http";
import { WebSocketServer, WebSocket } from "ws";

export interface EventConfig {
  enabled: boolean;
  icon: string;
  label: string;
  messageTemplate: string;
  accentColor: string;
}

export interface OverlayConfig {
  holdMs: number;
  position: "bottom-center" | "bottom-left" | "bottom-right" | "top-center" | "top-left" | "top-right";
  bgColor: string;
  bgOpacity: number;
  borderRadius: number;
  borderStyle: "left" | "full" | "bottom" | "glow" | "none";
  animation: "slide" | "bounce" | "fade";
  nameFontSize: number;
  msgFontSize: number;
  nameColor: string;
  msgColor: string;
  fontFamily: string;
  alertWidth: number;
  maxShown: number;
  events: {
    follow: EventConfig;
    subscribe: EventConfig;
    gift: EventConfig;
    raid: EventConfig;
  };
}

export interface OverlayEvent {
  eventType: string;
  username: string;
  message: string;
  amount?: number;
}

export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = {
  holdMs: 6000,
  position: "bottom-center",
  bgColor: "#0a0a14",
  bgOpacity: 88,
  borderRadius: 14,
  borderStyle: "left",
  animation: "slide",
  nameFontSize: 23,
  msgFontSize: 15,
  nameColor: "#ffffff",
  msgColor: "#d1d5db",
  fontFamily: "Inter",
  alertWidth: 620,
  maxShown: 3,
  events: {
    follow:    { enabled: true, icon: "💚", label: "New Follower",       messageTemplate: "{username} is now following!",                 accentColor: "#22c55e" },
    subscribe: { enabled: true, icon: "⭐", label: "New Subscriber",     messageTemplate: "{username} just subscribed!",                  accentColor: "#8b5cf6" },
    gift:      { enabled: true, icon: "🎁", label: "Gift Subscriptions", messageTemplate: "{username} gifted {amount} subs!",             accentColor: "#f59e0b" },
    raid:      { enabled: true, icon: "🚨", label: "Raid",               messageTemplate: "{username} is raiding with {amount} viewers!", accentColor: "#ef4444" },
  },
};

function mergeConfig(partial: Partial<OverlayConfig>): OverlayConfig {
  return {
    ...DEFAULT_OVERLAY_CONFIG,
    ...partial,
    events: {
      ...DEFAULT_OVERLAY_CONFIG.events,
      ...(partial.events ?? {}),
    },
  };
}

const OVERLAY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Stream Lights Overlay</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Exo+2:wght@400;700;800&family=Montserrat:wght@400;700;800&family=Orbitron:wght@400;700&family=Oswald:wght@400;700&family=Press+Start+2P&family=Rajdhani:wght@400;700&family=Russo+One&family=Inter:wght@400;700;800&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: transparent;
      width: 100vw; height: 100vh;
      overflow: hidden;
      display: flex;
      font-family: var(--font-family, 'Inter', 'Segoe UI', Arial, sans-serif);
    }
    #root {
      width: 100%; height: 100%;
      display: flex;
      padding: 48px 32px;
    }
    #alert-container {
      display: flex;
      gap: 10px;
      width: 100%;
    }
    .pos-bottom-center { align-items: center; justify-content: flex-end; flex-direction: column; }
    .pos-bottom-left   { align-items: flex-start; justify-content: flex-end; flex-direction: column; }
    .pos-bottom-right  { align-items: flex-end; justify-content: flex-end; flex-direction: column; }
    .pos-top-center    { align-items: center; justify-content: flex-start; flex-direction: column; }
    .pos-top-left      { align-items: flex-start; justify-content: flex-start; flex-direction: column; }
    .pos-top-right     { align-items: flex-end; justify-content: flex-start; flex-direction: column; }

    #alert-container.bottom { flex-direction: column; }
    #alert-container.top    { flex-direction: column-reverse; }

    .alert {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 16px 22px;
      width: 100%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04);
      will-change: transform, opacity;
      position: relative;
      overflow: hidden;
    }

    /* Border styles */
    .border-left   { border-left: 5px solid var(--accent, #7c3aed); }
    .border-full   { border: 2px solid var(--accent, #7c3aed); }
    .border-bottom { border-bottom: 4px solid var(--accent, #7c3aed); }
    .border-glow   { border: 2px solid var(--accent, #7c3aed); box-shadow: 0 0 22px var(--accent, #7c3aed), 0 8px 32px rgba(0,0,0,0.5); }
    .border-none   { border: none; }

    /* Animation variants */
    .anim-slide.entering { animation: slideUp 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards; }
    .anim-slide.exiting  { animation: slideDown 0.3s ease-in forwards; }
    .anim-slide-top.entering { animation: slideDown2 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards; }
    .anim-slide-top.exiting  { animation: slideUp2 0.3s ease-in forwards; }
    .anim-bounce.entering { animation: bounceIn 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards; }
    .anim-bounce.exiting  { animation: fadeOut 0.3s ease-in forwards; }
    .anim-fade.entering { animation: fadeIn 0.4s ease forwards; }
    .anim-fade.exiting  { animation: fadeOut 0.3s ease-in forwards; }

    @keyframes slideUp    { from { transform: translateY(70px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes slideDown  { from { transform: translateY(0); opacity: 1; } to { transform: translateY(70px); opacity: 0; } }
    @keyframes slideDown2 { from { transform: translateY(-70px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes slideUp2   { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-70px); opacity: 0; } }
    @keyframes bounceIn   { from { transform: scale(0.7); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    @keyframes fadeIn     { from { opacity: 0; } to { opacity: 1; } }
    @keyframes fadeOut    { from { opacity: 1; } to { opacity: 0; } }

    .alert::after {
      content: '';
      position: absolute;
      bottom: 0; left: 0;
      height: 3px;
      background: var(--accent, #7c3aed);
      width: 100%;
      opacity: 0.55;
      animation: shrink var(--hold) linear forwards;
    }
    @keyframes shrink { from { width: 100%; } to { width: 0%; } }

    .alert-icon { font-size: 2rem; line-height: 1; flex-shrink: 0; }
    .alert-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .alert-label { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: var(--accent, #a78bfa); opacity: 0.85; }
    .alert-name  { font-weight: 800; color: var(--name-color, #fff); line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .alert-msg   { color: var(--msg-color, #d1d5db); line-height: 1.3; }
  </style>
</head>
<body>
  <div id="root"><div id="alert-container" class="bottom"></div></div>
  <script>
    var cfg = null;
    var queue = [];
    var active = 0;

    var DEFAULT_CFG = {
      holdMs: 6000, position: "bottom-center",
      bgColor: "#0a0a14", bgOpacity: 88, borderRadius: 14,
      borderStyle: "left", animation: "slide",
      nameFontSize: 23, msgFontSize: 15,
      nameColor: "#ffffff", msgColor: "#d1d5db",
      fontFamily: "Inter", alertWidth: 620,
      maxShown: 3,
      events: {
        follow:    { enabled:true, icon:"💚", label:"New Follower",       messageTemplate:"{username} is now following!",                 accentColor:"#22c55e" },
        subscribe: { enabled:true, icon:"⭐", label:"New Subscriber",     messageTemplate:"{username} just subscribed!",                  accentColor:"#8b5cf6" },
        gift:      { enabled:true, icon:"🎁", label:"Gift Subscriptions", messageTemplate:"{username} gifted {amount} subs!",             accentColor:"#f59e0b" },
        raid:      { enabled:true, icon:"🚨", label:"Raid",               messageTemplate:"{username} is raiding with {amount} viewers!", accentColor:"#ef4444" }
      }
    };

    function applyConfig(c) {
      cfg = c;
      var root = document.getElementById('root');
      root.className = 'pos-' + c.position;
      var isTop = c.position.startsWith('top');
      var container = document.getElementById('alert-container');
      container.className = isTop ? 'top' : 'bottom';
      container.style.maxWidth = (c.alertWidth || 620) + 'px';

      var body = document.body;
      body.style.setProperty('--font-family', "'" + (c.fontFamily || 'Inter') + "', 'Segoe UI', Arial, sans-serif");
      body.style.setProperty('--name-color', c.nameColor || '#ffffff');
      body.style.setProperty('--msg-color', c.msgColor || '#d1d5db');
    }

    function hexToRgb(hex) {
      var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
      return isNaN(r) ? '10,10,20' : r+','+g+','+b;
    }

    function tpl(str, username, amount) {
      return str.replace(/\\{username\\}/g, username).replace(/\\{amount\\}/g, amount != null ? amount : '');
    }

    function esc(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function resolveEvent(ev) {
      var t = ev.eventType;
      var username = ev.username;
      var amount = ev.amount;
      // subscribe_gift maps to the gift event config key
      var key = t === 'subscribe_gift' ? 'gift' : t;
      var evCfg = cfg.events[key];
      if (!evCfg || !evCfg.enabled) return null;
      return { evCfg: evCfg, username: username, amount: amount };
    }

    function pump() {
      while (queue.length > 0 && active < cfg.maxShown) {
        showAlert(queue.shift());
      }
    }

    function showAlert(info) {
      active++;
      var c = cfg;
      var container = document.getElementById('alert-container');
      var isTop = c.position.startsWith('top');
      var animClass = c.animation === 'slide' ? (isTop ? 'anim-slide-top' : 'anim-slide')
                    : c.animation === 'bounce' ? 'anim-bounce' : 'anim-fade';
      var borderClass = 'border-' + (c.borderStyle || 'left');
      var rgb = hexToRgb(c.bgColor);
      var opacity = c.bgOpacity / 100;
      var msg = tpl(info.evCfg.messageTemplate, info.username, info.amount);

      var el = document.createElement('div');
      el.className = 'alert ' + animClass + ' ' + borderClass + ' entering';
      el.style.cssText = [
        'background:rgba('+rgb+','+opacity+')',
        'border-radius:'+c.borderRadius+'px',
        '--accent:'+info.evCfg.accentColor,
        '--hold:'+(c.holdMs/1000)+'s',
      ].join(';');
      el.innerHTML =
        '<div class="alert-icon">'+info.evCfg.icon+'</div>'+
        '<div class="alert-body">'+
          '<div class="alert-label">'+esc(info.evCfg.label)+'</div>'+
          '<div class="alert-name" style="font-size:'+c.nameFontSize+'px">'+esc(info.username)+'</div>'+
          '<div class="alert-msg" style="font-size:'+c.msgFontSize+'px">'+esc(msg)+'</div>'+
        '</div>';

      if (isTop) container.appendChild(el); else container.prepend(el);

      setTimeout(function() {
        el.classList.remove('entering');
        el.classList.add('exiting');
        setTimeout(function() { el.remove(); active--; pump(); }, 320);
      }, c.holdMs);
    }

    function onEvent(ev) {
      if (!cfg) return;
      var info = resolveEvent(ev);
      if (!info) return;
      queue.push(info);
      pump();
    }

    fetch('/config')
      .then(function(r) { return r.json(); })
      .then(function(c) { applyConfig(Object.assign({}, DEFAULT_CFG, c, { events: Object.assign({}, DEFAULT_CFG.events, c.events) })); })
      .catch(function() { applyConfig(DEFAULT_CFG); });

    var RETRY = 3000;
    function connect() {
      var ws = new WebSocket('ws://localhost:' + location.port + '/ws');
      ws.onopen = function() { RETRY = 3000; };
      ws.onmessage = function(e) {
        try {
          var msg = JSON.parse(e.data);
          if (msg.type === 'config') {
            applyConfig(Object.assign({}, DEFAULT_CFG, msg.data, { events: Object.assign({}, DEFAULT_CFG.events, msg.data.events) }));
          } else if (msg.type === 'event') {
            onEvent(msg.data);
          }
        } catch(err) {}
      };
      ws.onclose = function() { setTimeout(connect, RETRY); RETRY = Math.min(RETRY * 2, 30000); };
    }
    connect();
  </script>
</body>
</html>`;

let server: http.Server | null = null;
let wss: WebSocketServer | null = null;
let currentPort = 0;
let currentConfig: OverlayConfig = DEFAULT_OVERLAY_CONFIG;

export function startOverlayServer(port: number, config?: Partial<OverlayConfig>): void {
  if (config) currentConfig = mergeConfig(config);
  if (server && currentPort === port) return;
  stopOverlayServer();

  currentPort = port;
  server = http.createServer((req, res) => {
    if (req.url === "/overlay" || req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*" });
      res.end(OVERLAY_HTML);
    } else if (req.url === "/config") {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify(currentConfig));
    } else {
      res.writeHead(404); res.end();
    }
  });

  wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws) => {
    console.log("[Overlay] Browser source connected");
    ws.send(JSON.stringify({ type: "config", data: currentConfig }));
    ws.on("close", () => console.log("[Overlay] Browser source disconnected"));
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") console.error(`[Overlay] Port ${port} already in use — overlay disabled`);
    else console.error("[Overlay] Server error:", err.message);
    stopOverlayServer();
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`[Overlay] Running at http://localhost:${port}/overlay`);
  });
}

export function updateOverlayConfig(config: Partial<OverlayConfig>): void {
  currentConfig = mergeConfig(config);
  if (!wss) return;
  const msg = JSON.stringify({ type: "config", data: currentConfig });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

export function stopOverlayServer(): void {
  wss?.close(); server?.close();
  wss = null; server = null; currentPort = 0;
}

export function broadcastEvent(event: OverlayEvent): void {
  if (!wss) return;
  const msg = JSON.stringify({ type: "event", data: event });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}
