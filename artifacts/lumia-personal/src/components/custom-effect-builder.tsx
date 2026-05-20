import { useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface EffectStep {
  color: string;
  durationMs: number;
  brightness?: number;
  effect?: string;
  movementParams?: {
    speedMs?: number;
    minBrightness?: number;
    waveform?: "sine" | "linear" | "sharp";
  };
}

const MOVEMENTS = [
  { id: "solid",     emoji: "■",  label: "Solid",   desc: "Steady" },
  { id: "pulse",     emoji: "◉",  label: "Pulse",   desc: "One breath" },
  { id: "flash",     emoji: "⚡", label: "Flash",   desc: "Quick flash" },
  { id: "strobe",    emoji: "▒",  label: "Strobe",  desc: "Rapid blink" },
  { id: "fade",      emoji: "◐",  label: "Fade",    desc: "Fade out" },
  { id: "wave",      emoji: "〜", label: "Wave",    desc: "Smooth wave" },
  { id: "breathe",   emoji: "♦",  label: "Breathe", desc: "Slow breathe" },
  { id: "explosion", emoji: "✦",  label: "Burst",   desc: "Bright burst" },
  { id: "twinkle",   emoji: "✷",  label: "Twinkle", desc: "Flicker" },
  { id: "scanner",   emoji: "↔",  label: "Scanner", desc: "Sweep" },
  { id: "custom",    emoji: "⚙",  label: "Custom",  desc: "Define own" },
];

function fmtMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function timeMarkers(totalMs: number): number[] {
  const interval = totalMs <= 2000 ? 250 : totalMs <= 6000 ? 500 : totalMs <= 15000 ? 1000 : 2000;
  const marks: number[] = [0];
  let t = interval;
  while (t < totalMs) { marks.push(t); t += interval; }
  marks.push(totalMs);
  return marks;
}

interface Props {
  steps: EffectStep[];
  onChange: (steps: EffectStep[]) => void;
  globalBrightness?: number;
}

export default function CustomEffectBuilder({ steps, onChange, globalBrightness = 100 }: Props) {
  const [selectedIdx, setSelectedIdx] = useState<number>(0);

  const totalMs = steps.reduce((s, st) => s + st.durationMs, 0) || 1;
  const markers = timeMarkers(totalMs);

  const update = (i: number, patch: Partial<EffectStep>) =>
    onChange(steps.map((s, idx) => idx === i ? { ...s, ...patch } : s));

  const updateMovementParam = (i: number, key: string, val: unknown) =>
    update(i, { movementParams: { ...(steps[i].movementParams ?? {}), [key]: val } });

  const remove = (i: number) => {
    if (steps.length <= 1) return;
    const next = steps.filter((_, idx) => idx !== i);
    onChange(next);
    setSelectedIdx(Math.min(i, next.length - 1));
  };

  const add = () => {
    const last = steps[steps.length - 1];
    const next = [...steps, { color: last?.color ?? "#ff6600", durationMs: 500, brightness: last?.brightness, effect: last?.effect ?? "solid" }];
    onChange(next);
    setSelectedIdx(next.length - 1);
  };

  const moveUp = (i: number) => {
    if (i === 0) return;
    const next = [...steps];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onChange(next);
    setSelectedIdx(i - 1);
  };

  const moveDown = (i: number) => {
    if (i === steps.length - 1) return;
    const next = [...steps];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    onChange(next);
    setSelectedIdx(i + 1);
  };

  const sel = selectedIdx < steps.length ? selectedIdx : 0;
  const step = steps[sel];

  return (
    <div className="space-y-3">

      {/* ── Timeline bar ─────────────────────────────────── */}
      <div className="relative">
        <div className="flex rounded-lg overflow-hidden border border-border h-12 cursor-pointer">
          {steps.map((s, i) => {
            const widthPct = (s.durationMs / totalMs) * 100;
            const isSelected = i === sel;
            const mv = MOVEMENTS.find(m => m.id === (s.effect ?? "solid"));
            const bri = (s.brightness ?? globalBrightness) / 100;
            return (
              <div
                key={i}
                onClick={() => setSelectedIdx(i)}
                className={`relative flex flex-col items-center justify-center transition-all shrink-0 group
                  ${isSelected ? "ring-2 ring-inset ring-white/80" : "hover:brightness-110"}`}
                style={{ width: `${Math.max(widthPct, 3)}%`, backgroundColor: s.color, opacity: 0.3 + bri * 0.7 }}
                title={`Step ${i + 1}: ${s.color} · ${s.effect ?? "solid"} · ${fmtMs(s.durationMs)}`}
              >
                <span className="text-xs drop-shadow-lg select-none" style={{ textShadow: "0 0 4px #000" }}>
                  {mv?.emoji}
                </span>
                {widthPct > 8 && (
                  <span className="text-[9px] text-white/90 drop-shadow select-none" style={{ textShadow: "0 0 4px #000" }}>
                    {fmtMs(s.durationMs)}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Time markers */}
        <div className="relative h-4 mt-0.5">
          {markers.map((t, i) => {
            const pct = (t / totalMs) * 100;
            return (
              <span
                key={i}
                className="absolute text-[9px] text-muted-foreground/60 -translate-x-1/2"
                style={{ left: `${pct}%` }}
              >
                {fmtMs(t)}
              </span>
            );
          })}
        </div>
      </div>

      {/* ── Step inspector ───────────────────────────────── */}
      {step && (
        <div className="rounded-lg border border-primary/30 bg-muted/20 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">
              Step {sel + 1} of {steps.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => moveUp(sel)}
                disabled={sel === 0}
                className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                title="Move up"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => moveDown(sel)}
                disabled={sel === steps.length - 1}
                className="p-1 rounded hover:bg-muted disabled:opacity-30 transition-colors"
                title="Move down"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => remove(sel)}
                disabled={steps.length <= 1}
                className="p-1 rounded hover:bg-destructive/10 text-destructive disabled:opacity-30 transition-colors"
                title="Remove step"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Color + duration + brightness */}
          <div className="grid grid-cols-3 gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Colour</Label>
              <div className="flex gap-1.5 items-center">
                <input
                  type="color"
                  value={step.color}
                  onChange={e => update(sel, { color: e.target.value })}
                  className="w-9 h-9 rounded cursor-pointer border border-input p-0.5 bg-background shrink-0"
                />
                <Input
                  value={step.color}
                  onChange={e => update(sel, { color: e.target.value })}
                  className="font-mono text-xs h-9 uppercase"
                  maxLength={7}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Duration</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={step.durationMs}
                  onChange={e => update(sel, { durationMs: Math.max(50, Number(e.target.value)) })}
                  className="h-9 text-xs"
                  min={50}
                  step={50}
                />
                <span className="text-xs text-muted-foreground shrink-0">ms</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Brightness — {step.brightness ?? globalBrightness}%</Label>
              <input
                type="range"
                min={1}
                max={100}
                value={step.brightness ?? globalBrightness}
                onChange={e => update(sel, { brightness: Number(e.target.value) })}
                className="w-full accent-primary"
              />
            </div>
          </div>

          {/* Movement picker */}
          <div className="space-y-1.5">
            <Label className="text-xs">Movement</Label>
            <div className="flex flex-wrap gap-1">
              {MOVEMENTS.map(mv => (
                <button
                  key={mv.id}
                  type="button"
                  onClick={() => update(sel, { effect: mv.id })}
                  title={mv.desc}
                  className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-all ${
                    (step.effect ?? "solid") === mv.id
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-muted border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  <span>{mv.emoji}</span>
                  <span>{mv.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom movement params */}
          {(step.effect ?? "solid") === "custom" && (
            <div className="space-y-2 pl-2 border-l-2 border-primary/30">
              <p className="text-xs text-muted-foreground font-medium">Custom oscillation</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Cycle speed — {step.movementParams?.speedMs ?? 800}ms</Label>
                  <input
                    type="range"
                    min={100}
                    max={5000}
                    step={100}
                    value={step.movementParams?.speedMs ?? 800}
                    onChange={e => updateMovementParam(sel, "speedMs", Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Min brightness — {step.movementParams?.minBrightness ?? 10}%</Label>
                  <input
                    type="range"
                    min={0}
                    max={90}
                    value={step.movementParams?.minBrightness ?? 10}
                    onChange={e => updateMovementParam(sel, "minBrightness", Number(e.target.value))}
                    className="w-full accent-primary"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Waveform</Label>
                <div className="flex gap-1">
                  {(["sine", "linear", "sharp"] as const).map(wf => (
                    <button
                      key={wf}
                      type="button"
                      onClick={() => updateMovementParam(sel, "waveform", wf)}
                      className={`text-xs px-3 py-1 rounded-full border transition-all ${
                        (step.movementParams?.waveform ?? "sine") === wf
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {wf === "sine" ? "〜 Sine" : wf === "linear" ? "/ Linear" : "⊓ Square"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={add} className="gap-1.5 h-8 text-xs">
          <Plus className="w-3 h-3" />
          Add Step
        </Button>
        <span className="text-xs text-muted-foreground">
          {steps.length} step{steps.length !== 1 ? "s" : ""} · {fmtMs(totalMs)} total
        </span>
      </div>
    </div>
  );
}
