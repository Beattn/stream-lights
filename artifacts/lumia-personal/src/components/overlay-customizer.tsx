import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

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
  animation: "slide" | "bounce" | "fade";
  nameFontSize: number;
  msgFontSize: number;
  maxShown: number;
  events: {
    follow: EventConfig;
    subscribe: EventConfig;
    gift: EventConfig;
    raid: EventConfig;
  };
}

export const DEFAULT_OVERLAY_CONFIG: OverlayConfig = {
  holdMs: 6000,
  position: "bottom-center",
  bgColor: "#0a0a14",
  bgOpacity: 88,
  borderRadius: 14,
  animation: "slide",
  nameFontSize: 23,
  msgFontSize: 15,
  maxShown: 3,
  events: {
    follow:    { enabled: true, icon: "💚", label: "New Follower",       messageTemplate: "{username} is now following!",           accentColor: "#22c55e" },
    subscribe: { enabled: true, icon: "⭐", label: "New Subscriber",     messageTemplate: "{username} just subscribed!",            accentColor: "#8b5cf6" },
    gift:      { enabled: true, icon: "🎁", label: "Gift Subscriptions", messageTemplate: "{username} gifted {amount} subs!",       accentColor: "#f59e0b" },
    raid:      { enabled: true, icon: "🚨", label: "Raid",               messageTemplate: "{username} is raiding with {amount} viewers!", accentColor: "#ef4444" },
  },
};

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return isNaN(r) ? "10,10,20" : `${r},${g},${b}`;
}

function AlertPreview({ config, eventKey }: { config: OverlayConfig; eventKey: keyof OverlayConfig["events"] }) {
  const ev = config.events[eventKey];
  const rgb = hexToRgb(config.bgColor);
  const opacity = config.bgOpacity / 100;
  const sample = ev.messageTemplate.replace("{username}", "StreamerName").replace("{amount}", "5");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        background: `rgba(${rgb},${opacity})`,
        borderRadius: config.borderRadius,
        padding: "14px 20px",
        borderLeft: `4px solid ${ev.accentColor}`,
        boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        opacity: ev.enabled ? 1 : 0.4,
      }}
    >
      <span style={{ fontSize: 28 }}>{ev.icon}</span>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: ev.accentColor, marginBottom: 2 }}>
          {ev.label}
        </div>
        <div style={{ fontSize: config.nameFontSize, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>
          StreamerName
        </div>
        <div style={{ fontSize: config.msgFontSize, color: "#d1d5db", marginTop: 2 }}>
          {sample}
        </div>
      </div>
    </div>
  );
}

const EVENT_LABELS: Record<keyof OverlayConfig["events"], string> = {
  follow: "Follow",
  subscribe: "Subscribe",
  gift: "Gift Subs",
  raid: "Raid",
};

function EventEditor({
  label, value, onChange,
}: { label: string; value: EventConfig; onChange: (v: EventConfig) => void }) {
  const set = <K extends keyof EventConfig>(k: K, v: EventConfig[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{label}</span>
        <Switch checked={value.enabled} onCheckedChange={v => set("enabled", v)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Icon (emoji)</Label>
          <Input value={value.icon} onChange={e => set("icon", e.target.value)} className="text-lg h-9 w-16 text-center" maxLength={4} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Accent colour</Label>
          <div className="flex gap-2 items-center">
            <input type="color" value={value.accentColor} onChange={e => set("accentColor", e.target.value)}
              className="w-9 h-9 rounded cursor-pointer border border-input p-0.5 bg-background" />
            <Input value={value.accentColor} onChange={e => set("accentColor", e.target.value)}
              className="font-mono text-xs h-9" />
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Label text</Label>
        <Input value={value.label} onChange={e => set("label", e.target.value)} className="h-9" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Message — use <code className="bg-muted px-1 rounded">{"{username}"}</code> and <code className="bg-muted px-1 rounded">{"{amount}"}</code></Label>
        <Input value={value.messageTemplate} onChange={e => set("messageTemplate", e.target.value)} className="h-9" />
      </div>
    </div>
  );
}

interface Props {
  value: OverlayConfig;
  onChange: (config: OverlayConfig) => void;
}

const POSITIONS: OverlayConfig["position"][] = [
  "bottom-center", "bottom-left", "bottom-right",
  "top-center", "top-left", "top-right",
];
const ANIMATIONS: OverlayConfig["animation"][] = ["slide", "bounce", "fade"];

export default function OverlayCustomizer({ value, onChange }: Props) {
  const set = <K extends keyof OverlayConfig>(k: K, v: OverlayConfig[K]) =>
    onChange({ ...value, [k]: v });

  const setEvent = (key: keyof OverlayConfig["events"], ev: EventConfig) =>
    onChange({ ...value, events: { ...value.events, [key]: ev } });

  const eventKeys = Object.keys(value.events) as (keyof OverlayConfig["events"])[];

  return (
    <div className="space-y-6">

      {/* ── Live preview ───────────────────────────────── */}
      <div>
        <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Live preview</p>
        <div className="rounded-lg bg-muted/40 p-4 space-y-2 border border-border">
          {eventKeys.map(k => (
            <AlertPreview key={k} config={value} eventKey={k} />
          ))}
        </div>
      </div>

      {/* ── Timing & Layout ────────────────────────────── */}
      <div className="space-y-4">
        <p className="text-sm font-semibold border-b border-border pb-1">Timing & Layout</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Show duration — {(value.holdMs / 1000).toFixed(1)}s</Label>
            <input type="range" min={2000} max={15000} step={500} value={value.holdMs}
              onChange={e => set("holdMs", Number(e.target.value))}
              className="w-full accent-primary" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Max stacked — {value.maxShown}</Label>
            <input type="range" min={1} max={5} step={1} value={value.maxShown}
              onChange={e => set("maxShown", Number(e.target.value))}
              className="w-full accent-primary" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Position</Label>
            <select value={value.position} onChange={e => set("position", e.target.value as OverlayConfig["position"])}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
              {POSITIONS.map(p => <option key={p} value={p}>{p.replace("-", " ")}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Animation</Label>
            <select value={value.animation} onChange={e => set("animation", e.target.value as OverlayConfig["animation"])}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
              {ANIMATIONS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Appearance ─────────────────────────────────── */}
      <div className="space-y-4">
        <p className="text-sm font-semibold border-b border-border pb-1">Appearance</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Background colour</Label>
            <div className="flex gap-2 items-center">
              <input type="color" value={value.bgColor} onChange={e => set("bgColor", e.target.value)}
                className="w-9 h-9 rounded cursor-pointer border border-input p-0.5 bg-background" />
              <Input value={value.bgColor} onChange={e => set("bgColor", e.target.value)}
                className="font-mono text-xs h-9" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Background opacity — {value.bgOpacity}%</Label>
            <input type="range" min={0} max={100} value={value.bgOpacity}
              onChange={e => set("bgOpacity", Number(e.target.value))}
              className="w-full accent-primary" />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Corner radius — {value.borderRadius}px</Label>
          <input type="range" min={0} max={30} value={value.borderRadius}
            onChange={e => set("borderRadius", Number(e.target.value))}
            className="w-full accent-primary" />
        </div>
      </div>

      {/* ── Typography ─────────────────────────────────── */}
      <div className="space-y-4">
        <p className="text-sm font-semibold border-b border-border pb-1">Typography</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Name size — {value.nameFontSize}px</Label>
            <input type="range" min={14} max={40} value={value.nameFontSize}
              onChange={e => set("nameFontSize", Number(e.target.value))}
              className="w-full accent-primary" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Message size — {value.msgFontSize}px</Label>
            <input type="range" min={10} max={24} value={value.msgFontSize}
              onChange={e => set("msgFontSize", Number(e.target.value))}
              className="w-full accent-primary" />
          </div>
        </div>
      </div>

      {/* ── Per-event editors ──────────────────────────── */}
      <div className="space-y-4">
        <p className="text-sm font-semibold border-b border-border pb-1">Alert Events</p>
        <div className="grid grid-cols-1 gap-4">
          {eventKeys.map(k => (
            <div key={k} className="rounded-lg border border-border px-4 pb-4">
              <EventEditor
                label={EVENT_LABELS[k]}
                value={value.events[k]}
                onChange={ev => setEvent(k, ev)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
