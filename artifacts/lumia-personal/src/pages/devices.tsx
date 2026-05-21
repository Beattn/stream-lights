import { useListDevices, useToggleDevice, useTestDevice, useDeleteDevice, useCreateDevice } from "@workspace/api-client-react";
import { Lightbulb, Plus, Power, Trash2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export default function Devices() {
  const { data: devices, isLoading } = useListDevices();

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Devices</h1>
          <p className="text-muted-foreground mt-1">Manage connected smart lights and hubs.</p>
        </div>
        <AddDeviceModal />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {isLoading && <div className="text-muted-foreground">Loading devices...</div>}
        {devices?.length === 0 && (
          <div className="col-span-full py-12 text-center border-2 border-dashed border-border rounded-lg">
            <Lightbulb className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-medium mb-2">No Devices Found</h3>
            <p className="text-muted-foreground mb-6">Connect your first smart light to get started.</p>
            <AddDeviceModal />
          </div>
        )}
        {devices?.map((device) => (
          <DeviceCard key={device.id} device={device} />
        ))}
      </div>
    </div>
  );
}

function DeviceCard({ device }: { device: any }) {
  const toggle = useToggleDevice();
  const test = useTestDevice();
  const deleteDev = useDeleteDevice();
  const { toast } = useToast();

  const handleToggle = () => {
    toggle.mutate({ id: device.id }, {
      onSuccess: () => toast({ title: `${device.name} toggled.` })
    });
  };

  const handleTest = () => {
    test.mutate({
      id: device.id,
      data: { color: "#ffffff", effect: "pulse", brightness: 100, durationMs: 1000 }
    }, {
      onSuccess: () => toast({ title: `Test signal sent to ${device.name}.` })
    });
  };

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete ${device.name}?`)) {
      deleteDev.mutate({ id: device.id }, {
        onSuccess: () => toast({ title: `${device.name} deleted.` })
      });
    }
  };

  return (
    <Card className={`border-border bg-card overflow-hidden transition-all ${!device.enabled ? 'opacity-60' : ''}`}>
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-md ${device.isOnline ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
              <Lightbulb className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">{device.name}</h3>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-mono">{device.type.replace(/_/g, ' ')}</p>
            </div>
          </div>
          <span className={`flex h-2.5 w-2.5 rounded-full mt-1 ${device.isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}`} />
        </div>

        <div className="space-y-3 mb-6 text-sm text-muted-foreground">
          {device.bridgeIp && (
            <div className="flex justify-between border-b border-border/50 pb-2">
              <span>Bridge IP</span>
              <span className="font-mono text-foreground">{device.bridgeIp}</span>
            </div>
          )}
          {device.deviceId && (
            <div className="flex justify-between border-b border-border/50 pb-2">
              <span>Device ID</span>
              <span className="font-mono text-foreground text-xs">{device.deviceId}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 pt-4 border-t border-border/50">
          <Button variant="outline" size="icon" onClick={handleToggle} disabled={toggle.isPending} title="Toggle Power">
            <Power className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={handleTest} disabled={test.isPending} title="Test Light">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <div className="ml-auto">
            <Button variant="ghost" size="icon" onClick={handleDelete} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

const DEVICE_TYPES = [
  { value: "philips_hue", label: "Philips Hue" },
  { value: "lifx", label: "LIFX" },
  { value: "govee", label: "Govee" },
  { value: "nanoleaf", label: "Nanoleaf" },
  { value: "generic_http", label: "Generic HTTP Webhook" },
];

interface FieldConfig {
  showBridgeIp: boolean;
  bridgeIpLabel: string;
  bridgeIpPlaceholder: string;
  showApiKey: boolean;
  apiKeyLabel: string;
  showDeviceId: boolean;
  deviceIdLabel: string;
  deviceIdPlaceholder: string;
  deviceIdHint: string;
}

function getFieldConfig(type: string): FieldConfig {
  switch (type) {
    case "philips_hue":
      return {
        showBridgeIp: true, bridgeIpLabel: "Bridge IP Address", bridgeIpPlaceholder: "192.168.1.x",
        showApiKey: true, apiKeyLabel: "Hue API Key / Username",
        showDeviceId: true, deviceIdLabel: "Light ID", deviceIdPlaceholder: "1",
        deviceIdHint: "The numeric light ID from your Hue bridge (usually 1, 2, 3…).",
      };
    case "govee":
      return {
        showBridgeIp: false, bridgeIpLabel: "", bridgeIpPlaceholder: "",
        showApiKey: true, apiKeyLabel: "Govee API Key",
        showDeviceId: true, deviceIdLabel: "Device ID (MODEL:MAC)", deviceIdPlaceholder: "H6159:AA:BB:CC:DD:EE:FF",
        deviceIdHint: "Open the Govee app → tap your device → ⚙ Settings → Device Info. Format: MODEL:MAC (e.g. H6159:AA:BB:CC:DD:EE:FF).",
      };
    case "lifx":
      return {
        showBridgeIp: false, bridgeIpLabel: "", bridgeIpPlaceholder: "",
        showApiKey: true, apiKeyLabel: "LIFX API Token",
        showDeviceId: true, deviceIdLabel: "Device Serial (optional)", deviceIdPlaceholder: "Leave blank to target all bulbs",
        deviceIdHint: "Leave blank to control all LIFX bulbs on the account.",
      };
    case "nanoleaf":
      return {
        showBridgeIp: true, bridgeIpLabel: "Nanoleaf IP Address", bridgeIpPlaceholder: "192.168.1.x",
        showApiKey: true, apiKeyLabel: "Auth Token",
        showDeviceId: false, deviceIdLabel: "", deviceIdPlaceholder: "", deviceIdHint: "",
      };
    case "generic_http":
      return {
        showBridgeIp: true, bridgeIpLabel: "Webhook URL", bridgeIpPlaceholder: "https://...",
        showApiKey: true, apiKeyLabel: "Bearer Token (optional)",
        showDeviceId: false, deviceIdLabel: "", deviceIdPlaceholder: "", deviceIdHint: "",
      };
    default:
      return {
        showBridgeIp: true, bridgeIpLabel: "IP Address", bridgeIpPlaceholder: "192.168.1.x",
        showApiKey: true, apiKeyLabel: "API Key / Token",
        showDeviceId: false, deviceIdLabel: "", deviceIdPlaceholder: "", deviceIdHint: "",
      };
  }
}

function AddDeviceModal() {
  const [open, setOpen] = useState(false);
  const create = useCreateDevice();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [type, setType] = useState("philips_hue");
  const [bridgeIp, setBridgeIp] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [deviceId, setDeviceId] = useState("");

  const fields = getFieldConfig(type);

  const handleTypeChange = (newType: string) => {
    setType(newType);
    setBridgeIp("");
    setApiKey("");
    setDeviceId("");
  };

  const handleSave = () => {
    if (type === "govee" && !deviceId.trim()) {
      toast({ title: "Device ID required", description: "Govee lights need a Device ID in MODEL:MAC format to receive commands.", variant: "destructive" });
      return;
    }
    if (type === "govee" && !deviceId.includes(":")) {
      toast({ title: "Invalid Device ID", description: "Govee Device ID must be in MODEL:MAC format (e.g. H6159:AA:BB:CC:DD:EE:FF).", variant: "destructive" });
      return;
    }
    create.mutate({
      data: {
        name,
        type,
        bridgeIp: fields.showBridgeIp ? bridgeIp || undefined : undefined,
        apiKey: apiKey || undefined,
        deviceId: deviceId.trim() || undefined,
        enabled: true,
      }
    }, {
      onSuccess: () => {
        toast({ title: "Device added successfully" });
        setOpen(false);
        setName(""); setType("philips_hue"); setBridgeIp(""); setApiKey(""); setDeviceId("");
      },
      onError: (err: any) => {
        toast({ title: "Failed to add device", description: err?.message ?? "Unknown error", variant: "destructive" });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="w-4 h-4" />
          Add Device
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Device</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Neon Rope Light" />
          </div>
          <div className="grid gap-2">
            <Label>Device Type</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              value={type} onChange={e => handleTypeChange(e.target.value)}
            >
              {DEVICE_TYPES.map(dt => (
                <option key={dt.value} value={dt.value}>{dt.label}</option>
              ))}
            </select>
          </div>

          {fields.showBridgeIp && (
            <div className="grid gap-2">
              <Label>{fields.bridgeIpLabel}</Label>
              <Input value={bridgeIp} onChange={e => setBridgeIp(e.target.value)} placeholder={fields.bridgeIpPlaceholder} />
            </div>
          )}

          {fields.showApiKey && (
            <div className="grid gap-2">
              <Label>{fields.apiKeyLabel}</Label>
              <Input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" placeholder="Paste your key here" />
            </div>
          )}

          {fields.showDeviceId && (
            <div className="grid gap-2">
              <Label>
                {fields.deviceIdLabel}
                {type === "govee" && <span className="text-destructive ml-1">*</span>}
              </Label>
              <Input value={deviceId} onChange={e => setDeviceId(e.target.value)} placeholder={fields.deviceIdPlaceholder} />
              {fields.deviceIdHint && (
                <p className="text-xs text-muted-foreground leading-relaxed">{fields.deviceIdHint}</p>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={create.isPending || !name}>Save Device</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
