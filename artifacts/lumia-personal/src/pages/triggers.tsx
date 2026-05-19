import { useState } from "react";
import {
  useListTriggers, useCreateTrigger, useUpdateTrigger, useDeleteTrigger, useFireTrigger,
} from "@workspace/api-client-react";
import { Zap, Plus, Trash2, Play, ToggleLeft, ToggleRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const EVENT_TYPES = [
  "follow", "subscribe", "bits", "donation", "raid", "host", "ban", "timeout", "chat_message", "channel_point"
];
const EFFECTS = ["solid", "strobe", "pulse", "rainbow", "fade", "police"];
const PLATFORMS = ["twitch", "youtube", "kick", "streamlabs", "streamelements"];

const EVENT_COLORS: Record<string, string> = {
  follow: "#00FF88",
  subscribe: "#FFD700",
  bits: "#00BFFF",
  donation: "#FF8C00",
  raid: "#FF4500",
  host: "#9B59B6",
  ban: "#FF0000",
  timeout: "#FF6347",
  chat_message: "#FFFFFF",
  channel_point: "#FF69B4",
};

export default function Triggers() {
  const { data: triggers, isLoading } = useListTriggers();

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Event Triggers</h1>
          <p className="text-muted-foreground mt-1">Configure what happens to your lights when stream events fire.</p>
        </div>
        <AddTriggerModal />
      </div>

      <div className="space-y-3">
        {isLoading && <div className="text-muted-foreground py-4">Loading triggers...</div>}
        {!isLoading && triggers?.length === 0 && (
          <div className="py-16 text-center border-2 border-dashed border-border rounded-lg">
            <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-40" />
            <h3 className="text-xl font-medium mb-2">No Triggers Yet</h3>
            <p className="text-muted-foreground mb-6">Add your first event trigger to start reacting to stream events.</p>
            <AddTriggerModal />
          </div>
        )}
        {triggers?.map((trigger) => (
          <TriggerRow key={trigger.id} trigger={trigger} />
        ))}
      </div>
    </div>
  );
}

function TriggerRow({ trigger }: { trigger: any }) {
  const update = useUpdateTrigger();
  const deleteTrigger = useDeleteTrigger();
  const fire = useFireTrigger();
  const { toast } = useToast();

  const handleToggle = () => {
    update.mutate({ id: trigger.id, data: { enabled: !trigger.enabled } }, {
      onSuccess: () => toast({ title: `Trigger ${trigger.enabled ? "disabled" : "enabled"}.` })
    });
  };

  const handleFire = () => {
    fire.mutate({ id: trigger.id }, {
      onSuccess: (res) => toast({ title: res.message }),
      onError: () => toast({ title: "Failed to fire trigger", variant: "destructive" }),
    });
  };

  const handleDelete = () => {
    if (confirm(`Delete trigger "${trigger.name}"?`)) {
      deleteTrigger.mutate({ id: trigger.id }, {
        onSuccess: () => toast({ title: "Trigger deleted." })
      });
    }
  };

  return (
    <Card className={`border-border bg-card transition-all ${!trigger.enabled ? "opacity-50" : ""}`}>
      <CardContent className="p-4 flex items-center gap-4">
        <div
          className="w-10 h-10 rounded-md shrink-0 shadow-lg"
          style={{ backgroundColor: trigger.color, boxShadow: `0 0 12px ${trigger.color}55` }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{trigger.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 uppercase tracking-wider font-bold">
              {trigger.eventType}
            </span>
            {trigger.platform && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border uppercase tracking-wider">
                {trigger.platform}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
            <span className="capitalize">{trigger.effect}</span>
            <span>·</span>
            <span>{trigger.brightness}% brightness</span>
            <span>·</span>
            <span>{(trigger.durationMs / 1000).toFixed(1)}s</span>
            {trigger.minAmount && (
              <>
                <span>·</span>
                <span>Min: {trigger.minAmount}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={handleFire} disabled={fire.isPending} className="gap-1.5">
            <Play className="w-3.5 h-3.5" />
            Test
          </Button>
          <Button variant="ghost" size="icon" onClick={handleToggle} disabled={update.isPending} title="Toggle">
            {trigger.enabled
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

function AddTriggerModal() {
  const [open, setOpen] = useState(false);
  const create = useCreateTrigger();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [eventType, setEventType] = useState("follow");
  const [platform, setPlatform] = useState("twitch");
  const [color, setColor] = useState(EVENT_COLORS["follow"]);
  const [brightness, setBrightness] = useState(100);
  const [durationMs, setDurationMs] = useState(3000);
  const [effect, setEffect] = useState("pulse");
  const [minAmount, setMinAmount] = useState("");

  const handleSave = () => {
    create.mutate({
      data: {
        name, eventType, platform, color, brightness,
        durationMs, effect, enabled: true, returnToIdle: true,
        ...(minAmount ? { minAmount: parseInt(minAmount) } : {}),
        deviceIds: [],
      }
    }, {
      onSuccess: () => {
        toast({ title: "Trigger created!" });
        setOpen(false);
        setName(""); setEventType("follow"); setPlatform("twitch");
        setColor(EVENT_COLORS["follow"]); setBrightness(100); setDurationMs(3000);
        setEffect("pulse"); setMinAmount("");
      },
      onError: () => toast({ title: "Failed to create trigger", variant: "destructive" }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Add Trigger
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Event Trigger</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. New Follower Flash" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Event Type</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={eventType}
                onChange={e => { setEventType(e.target.value); setColor(EVENT_COLORS[e.target.value] || "#FFFFFF"); }}>
                {EVENT_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Platform</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={platform} onChange={e => setPlatform(e.target.value)}>
                {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Light Color</Label>
            <div className="flex gap-3">
              <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-14 h-10 rounded-md border border-input cursor-pointer p-1 bg-background" />
              <Input value={color} onChange={e => setColor(e.target.value)} className="font-mono uppercase" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Effect</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={effect} onChange={e => setEffect(e.target.value)}>
                {EFFECTS.map(ef => <option key={ef} value={ef}>{ef}</option>)}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>Duration (ms)</Label>
              <Input type="number" value={durationMs} onChange={e => setDurationMs(Number(e.target.value))} min={500} step={500} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Brightness ({brightness}%)</Label>
            <input type="range" min="1" max="100" value={brightness} onChange={e => setBrightness(Number(e.target.value))} className="w-full accent-primary" />
          </div>
          <div className="grid gap-2">
            <Label>Minimum Amount (optional — for bits/donations)</Label>
            <Input type="number" value={minAmount} onChange={e => setMinAmount(e.target.value)} placeholder="e.g. 100" />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={create.isPending || !name}>Create Trigger</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
