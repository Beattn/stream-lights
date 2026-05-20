import { Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface EffectStep {
  color: string;
  durationMs: number;
  brightness?: number;
}

interface Props {
  steps: EffectStep[];
  onChange: (steps: EffectStep[]) => void;
  globalBrightness?: number;
}

export default function CustomEffectBuilder({ steps, onChange, globalBrightness = 100 }: Props) {
  const totalMs = steps.reduce((s, st) => s + st.durationMs, 0) || 1;

  const addStep = () => {
    const last = steps[steps.length - 1];
    onChange([...steps, { color: last?.color ?? "#ff6600", durationMs: 500 }]);
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
            title={`Step ${i + 1}: ${step.color} for ${step.durationMs}ms`}
          />
        ))}
      </div>

      {/* Steps list */}
      <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2 border border-border/50">
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0 opacity-40" />

            {/* Color */}
            <input
              type="color"
              value={step.color}
              onChange={e => updateStep(i, { color: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent p-0"
            />

            {/* Color hex */}
            <Input
              value={step.color}
              onChange={e => updateStep(i, { color: e.target.value })}
              className="w-24 font-mono text-xs h-8 uppercase"
              maxLength={7}
            />

            {/* Duration */}
            <div className="flex items-center gap-1.5 flex-1">
              <Input
                type="number"
                value={step.durationMs}
                onChange={e => updateStep(i, { durationMs: Math.max(100, Number(e.target.value)) })}
                className="h-8 text-xs"
                min={100}
                step={100}
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">ms</span>
            </div>

            {/* Brightness override */}
            <div className="flex items-center gap-1.5 w-24 shrink-0">
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
              className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
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
