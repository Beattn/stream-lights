import { useState } from "react";
import {
  useListCommands, useCreateCommand, useUpdateCommand, useDeleteCommand,
} from "@workspace/api-client-react";
import { Terminal, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import CustomEffectBuilder, { type EffectStep } from "@/components/custom-effect-builder";

const EFFECTS = ["solid", "strobe", "pulse", "rainbow", "fade", "police", "custom"];

const DEFAULT_STEPS: EffectStep[] = [
  { color: "#ff00ff", durationMs: 500 },
  { color: "#00ffff", durationMs: 500 },
];

export default function Commands() {
  const { data: commands, isLoading } = useListCommands();

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chat Commands</h1>
          <p className="text-muted-foreground mt-1">Let viewers type commands in chat to control your lights.</p>
        </div>
        <AddCommandModal />
      </div>

      <div className="space-y-3">
        {isLoading && <div className="text-muted-foreground py-4">Loading commands...</div>}
        {!isLoading && commands?.length === 0 && (
          <div className="py-16 text-center border-2 border-dashed border-border rounded-lg">
            <Terminal className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <h3 className="text-xl font-medium mb-2">No Commands Yet</h3>
            <p className="text-muted-foreground mb-6">Add chat commands like !red or !party so viewers can control your lights.</p>
            <AddCommandModal />
          </div>
        )}
        {commands?.map((cmd: any) => (
          <CommandRow key={cmd.id} command={cmd} />
        ))}
      </div>
    </div>
  );
}

function CommandRow({ command }: { command: any }) {
  const update = useUpdateCommand();
  const deleteCmd = useDeleteCommand();
  const { toast } = useToast();

  let customSteps: EffectStep[] = [];
  try { customSteps = JSON.parse(command.customSteps ?? "[]"); } catch {}

  const handleToggle = () => {
    update.mutate({ id: command.id, data: { enabled: !command.enabled } }, {
      onSuccess: () => toast({ title: `Command ${command.enabled ? "disabled" : "enabled"}.` })
    });
  };

  const handleDelete = () => {
    if (confirm(`Delete command "${command.command}"?`)) {
      deleteCmd.mutate({ id: command.id }, {
        onSuccess: () => toast({ title: "Command deleted." })
      });
    }
  };

  return (
    <Card className={`border-border bg-card transition-all ${!command.enabled ? "opacity-50" : ""}`}>
      <CardContent className="p-4 flex items-center gap-4">
        {command.effect === "custom" && customSteps.length > 0 ? (
          <div className="w-10 h-10 rounded-md shrink-0 overflow-hidden flex border border-border/50">
            {customSteps.map((s: EffectStep, i: number) => (
              <div key={i} className="h-full flex-1" style={{ backgroundColor: s.color }} />
            ))}
          </div>
        ) : (
          <div
            className="w-10 h-10 rounded-md shrink-0 flex items-center justify-center"
            style={{ backgroundColor: command.color + "22", border: `1px solid ${command.color}55` }}
          >
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: command.color, boxShadow: `0 0 8px ${command.color}` }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-primary text-lg">{command.command}</span>
            <span className="text-muted-foreground text-sm">{command.name}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
            <span className="capitalize">{command.effect}</span>
            {command.effect === "custom" && customSteps.length > 0 && (
              <span>({customSteps.length} steps)</span>
            )}
            <span>·</span>
            <span>{command.brightness}% brightness</span>
            <span>·</span>
            <span>
              {command.effect === "custom" && customSteps.length > 0
                ? `${(customSteps.reduce((s: number, st: EffectStep) => s + st.durationMs, 0) / 1000).toFixed(1)}s`
                : `${(command.durationMs / 1000).toFixed(1)}s`}
            </span>
            <span>·</span>
            <span>Cooldown: {command.cooldownSeconds}s</span>
            {command.usageCount > 0 && (
              <>
                <span>·</span>
                <span className="text-primary">{command.usageCount} uses</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="icon" onClick={handleToggle} disabled={update.isPending} title="Toggle">
            {command.enabled
              ? <ToggleRight className="w-5 h-5 text-primary" />
              : <ToggleLeft className="w-5 h-5 text-muted-foreground" />
            }
          </Button>
          <Button variant="ghost" size="icon" onClick={handleDelete} className="text-destructive hover:bg-destructive/10">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AddCommandModal() {
  const [open, setOpen] = useState(false);
  const create = useCreateCommand();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [color, setColor] = useState("#FF00FF");
  const [brightness, setBrightness] = useState(100);
  const [durationMs, setDurationMs] = useState(5000);
  const [effect, setEffect] = useState("rainbow");
  const [cooldownSeconds, setCooldownSeconds] = useState(30);
  const [customSteps, setCustomSteps] = useState<EffectStep[]>(DEFAULT_STEPS);

  const handleSave = () => {
    const totalCustomMs = customSteps.reduce((s, st) => s + st.durationMs, 0);
    create.mutate({
      data: {
        name, command, color, brightness,
        durationMs: effect === "custom" ? totalCustomMs : durationMs,
        effect, enabled: true, cooldownSeconds,
        customSteps: effect === "custom" ? JSON.stringify(customSteps) : "[]",
      }
    }, {
      onSuccess: () => {
        toast({ title: "Command created!" });
        setOpen(false);
        setName(""); setCommand(""); setColor("#FF00FF");
        setBrightness(100); setDurationMs(5000); setEffect("rainbow");
        setCooldownSeconds(30); setCustomSteps(DEFAULT_STEPS);
      },
      onError: () => toast({ title: "Failed to create command", variant: "destructive" }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Add Command
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Chat Command</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Display Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Party Mode" />
            </div>
            <div className="grid gap-2">
              <Label>Command</Label>
              <Input value={command} onChange={e => setCommand(e.target.value)} placeholder="!party" className="font-mono" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Effect</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={effect} onChange={e => setEffect(e.target.value)}>
                {EFFECTS.map(ef => (
                  <option key={ef} value={ef}>{ef === "custom" ? "✦ Custom Sequence" : ef}</option>
                ))}
              </select>
            </div>
            {effect !== "custom" && (
              <div className="grid gap-2">
                <Label>Duration (ms)</Label>
                <Input type="number" value={durationMs} onChange={e => setDurationMs(Number(e.target.value))} min={500} step={500} />
              </div>
            )}
          </div>

          {effect === "custom" ? (
            <div className="grid gap-2">
              <Label>Light Sequence</Label>
              <p className="text-xs text-muted-foreground -mt-1">Paint the steps your lights will play in order.</p>
              <CustomEffectBuilder steps={customSteps} onChange={setCustomSteps} globalBrightness={brightness} />
            </div>
          ) : (
            <div className="grid gap-2">
              <Label>Light Color</Label>
              <div className="flex gap-3">
                <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-14 h-10 rounded-md border border-input cursor-pointer p-1 bg-background" />
                <Input value={color} onChange={e => setColor(e.target.value)} className="font-mono uppercase" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Brightness ({brightness}%)</Label>
              <input type="range" min="1" max="100" value={brightness} onChange={e => setBrightness(Number(e.target.value))} className="w-full accent-primary mt-2" />
            </div>
            <div className="grid gap-2">
              <Label>Cooldown (seconds)</Label>
              <Input type="number" value={cooldownSeconds} onChange={e => setCooldownSeconds(Number(e.target.value))} min={0} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={create.isPending || !name || !command || (effect === "custom" && customSteps.length === 0)}>
            Create Command
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
