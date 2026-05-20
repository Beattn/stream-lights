import { useState } from "react";
import {
  useListTriggers, useCreateTrigger, useUpdateTrigger, useDeleteTrigger, useFireTrigger,
} from "@workspace/api-client-react";
import { Zap, Plus, Trash2, Play, ToggleLeft, ToggleRight, Edit } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const EVENT_TYPES = [
  "follow", "subscribe", "bits", "raid", "donation", "channel_point",
  "chat_message", "ban", "timeout",
];

const PLATFORMS = ["twitch", "youtube", "kick", "streamlabs", "streamelements"];

const EFFECTS = ["solid", "pulse", "flash", "rainbow", "breathe"];

export default function Triggers() {
  const { data: triggers, isLoading } = useListTriggers();

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Triggers</h1>
          <p className="text-muted-foreground mt-1">Automate your lights based on streaming events.</p>
        </div>
        <AddTriggerModal />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {isLoading && <div className="text-muted-foreground">Loading triggers...</div>}
        {triggers?.length === 0 && !isLoading && (
          <div className="col-span-full py-12 text-center border-2 border-dashed border-border rounded-lg">
            <Zap className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-medium mb-2">No Triggers Yet</h3>
            <p className="text-muted-foreground mb-6">Create your first trigger to react to stream events with lights.</p>
            <AddTriggerModal />
          </div>
        )}
        {triggers?.map((trigger) => (
          <TriggerCard key={trigger.id} trigger={trigger} />
        ))}
      </div>
    </div>
  );
}

function TriggerCard({ trigger }: { trigger: any }) {
  const deleteTrigger = useDeleteTrigger();
  const updateTrigger = useUpdateTrigger();
  const fireTrigger = useFireTrigger();
  const { toast } = useToast();

  const handleDelete = () => {
    if (confirm(`Delete trigger "${trigger.name}"?`)) {
      deleteTrigger.mutate({ id: trigger.id }, {
        onSuccess: () => toast({ title: `Trigger "${trigger.name}" deleted.` }),
        onError: () => toast({ title: "Failed to delete trigger", variant: "destructive" }),
      });
    }
  };

  const handleToggle = () => {
    updateTrigger.mutate({ id: trigger.id, data: { enabled: !trigger.enabled } }, {
      onSuccess: () => toast({ title: `Trigger ${trigger.enabled ? "disabled" : "enabled"}.` }),
      onError: () => toast({ title: "Failed to update trigger", variant: "destructive" }),
    });
  };

  const handleFire = () => {
    fireTrigger.mutate({ id: trigger.id }, {
      onSuccess: () => toast({ title: `Trigger "${trigger.name}" fired!` }),
      onError: () => toast({ title: "Failed to fire trigger", variant: "destructive" }),
    });
  };

  return (
    <Card className={`border-border bg-card overflow-hidden transition-all ${!trigger.enabled ? "opacity-60" : ""}`}>
      <div className="h-1 w-full" style={{ backgroundColor: trigger.color }} />
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <span style={{ color: trigger.color }}>{trigger.name}</span>
            </CardTitle>
            <CardDescription className="mt-1 capitalize">
              {trigger.eventType?.replace("_", " ")}
              {trigger.platform && ` · ${trigger.platform}`}
            </CardDescription>
          </div>
          <div className={`text-xs px-2 py-1 rounded-full font-bold uppercase tracking-wider ${trigger.enabled ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-muted text-muted-foreground border border-border"}`}>
            {trigger.enabled ? "On" : "Off"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground capitalize">{trigger.effect}</span>
          <span className="px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">{trigger.brightness}% bright</span>
          <span className="px-2 py-0.5 rounded-full bg-muted border border-border text-muted-foreground">{trigger.durationMs}ms</span>
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-border/50">
          <Button variant="outline" size="sm" onClick={handleFire} disabled={fireTrigger.isPending || !trigger.enabled} className="gap-1.5">
            <Play className="w-3.5 h-3.5" />
            Test
          </Button>
          <Button variant="outline" size="icon" onClick={handleToggle} disabled={updateTrigger.isPending} title={trigger.enabled ? "Disable" : "Enable"}>
            {trigger.enabled ? <ToggleRight className="w-4 h-4 text-green-500" /> : <ToggleLeft className="w-4 h-4" />}
          </Button>
          <div className="ml-auto">
            <Button variant="ghost" size="icon" onClick={handleDelete} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
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
  const [color, setColor] = useState("#9146FF");
  const [brightness, setBrightness] = useState(100);
  const [durationMs, setDurationMs] = useState(3000);
  const [effect, setEffect] = useState("pulse");

  const handleSave = () => {
    create.mutate({
      data: { name, eventType, platform, color, brightness, durationMs, effect, enabled: true },
    }, {
      onSuccess: () => {
        toast({ title: "Trigger created!" });
        setOpen(false);
        setName(""); setEventType("follow"); setPlatform("twitch");
        setColor("#9146FF"); setBrightness(100); setDurationMs(3000); setEffect("pulse");
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
      <DialogContent className="bg-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Trigger</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. New Follower" />
          </div>
          <div className="grid gap-2">
            <Label>Event Type</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              value={eventType} onChange={e => setEventType(e.target.value)}
            >
              {EVENT_TYPES.map(t => (
                <option key={t} value={t}>{t.replace("_", " ")}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label>Platform</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              value={platform} onChange={e => setPlatform(e.target.value)}
            >
              {PLATFORMS.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-10 w-10 rounded border border-input cursor-pointer" />
                <Input value={color} onChange={e => setColor(e.target.value)} className="font-mono" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Effect</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                value={effect} onChange={e => setEffect(e.target.value)}
              >
                {EFFECTS.map(ef => (
                  <option key={ef} value={ef}>{ef}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Brightness ({brightness}%)</Label>
              <Input type="number" min={0} max={100} value={brightness} onChange={e => setBrightness(Number(e.target.value))} />
            </div>
            <div className="grid gap-2">
              <Label>Duration (ms)</Label>
              <Input type="number" min={100} max={60000} value={durationMs} onChange={e => setDurationMs(Number(e.target.value))} />
            </div>
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
