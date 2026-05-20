import { Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface EffectStep {
  color: string;
  durationMs: number;
  brightness?: number;
  effect?: string;
}

const STEP_EFFECTS = ["solid", "pulse", "flash", "strobe", "fade"];

interface Props {
  steps: EffectStep[];
  onChange: (steps: EffectStep[]) => void;
  globalBrightness?: number;
}

export default function CustomEffectBuilder({ steps, onChange, globalBrightness = 100 }: Props) {
  const totalMs = steps.reduce((s, st) => s + st.durationMs, 0) || 1;

  const addStep = () => {
    const last = steps[steps.length - 1];
    onChange([...steps, { color: last?.color ?? "#ff6600", durationMs: 500, effect: last?.effect ?? "solid" }]);
  };

  const updateStep = (i: number, patch: Partial<EffectStep>) => {
    onChange(steps.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };

  const removeStep = (i: number) => {
    if (steps.length <= 1) return;
    onChange(steps.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-3">
      {/* Visual preview bar */}
      <div className="flex rounded-lg overflow-hidden h-8 border border-border">
        {steps.map((step, i) => (
          <div
            key={i}
            className="h-full transition-all"
            style={{
              backgroundColor: step.color,
              width: `${(step.durationMs / totalMs) * 100}%`,
              minWidth: "4px",
              opacity: (step.brightness ?? globalBrightness) / 100,
            }}
            title={`Step ${i + 1}: ${step.color} · ${step.effect ?? "solid"} for ${step.durationMs}ms`}
          />
        ))}
      </div>

      {/* Steps list */}
      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {steps.map((step, i) => (
          <div key={i} className="bg-muted/30 rounded-lg px-3 py-2 border border-border/50 space-y-2">
            {/* Row 1: color + hex + duration + brightness + delete */}
            <div className="flex items-center gap-2">
              <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0 opacity-40" />

              <input
                type="color"
                value={step.color}
                onChange={e => updateStep(i, { color: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent p-0 shrink-0"
              />

              <Input
                value={step.color}
                onChange={e => updateStep(i, { color: e.target.value })}
                className="w-24 font-mono text-xs h-8 uppercase shrink-0"
                maxLength={7}
              />

              <Input
                type="number"
                value={step.durationMs}
                onChange={e => updateStep(i, { durationMs: Math.max(100, Number(e.target.value)) })}
                className="h-8 text-xs flex-1"
                min={100}
                step={100}
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">ms</span>

              <div className="flex items-center gap-1 w-20 shrink-0">
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={step.brightness ?? globalBrightness}
                  onChange={e => updateStep(i, { brightness: Number(e.target.value) })}
                  className="w-full accent-primary"
                  title={`Brightness: ${step.brightness ?? globalBrightness}%`}
                />
              </div>

              <button
                onClick={() => removeStep(i)}
                disabled={steps.length <= 1}
                className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30 shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Row 2: movement/effect per step */}
            <div className="flex items-center gap-2 pl-5">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Movement:</span>
              <div className="flex gap-1 flex-wrap">
                {STEP_EFFECTS.map(ef => (
                  <button
                    key={ef}
                    onClick={() => updateStep(i, { effect: ef })}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors capitalize ${
                      (step.effect ?? "solid") === ef
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted border-border text-muted-foreground hover:border-primary/50"
                    }`}
                  >
                    {ef}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" size="sm" onClick={addStep} className="gap-1.5 h-8 text-xs">
          <Plus className="w-3 h-3" />
          Add Step
        </Button>
        <span className="text-xs text-muted-foreground">
          {steps.length} step{steps.length !== 1 ? "s" : ""} · {(totalMs / 1000).toFixed(1)}s total
        </span>
      </div>
    </div>
  );
}
