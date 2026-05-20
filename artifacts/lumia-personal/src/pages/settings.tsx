import { useState, useEffect } from "react";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { Settings as SettingsIcon, Power, Save, Monitor } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import OverlayCustomizer, { DEFAULT_OVERLAY_CONFIG, type OverlayConfig } from "@/components/overlay-customizer";

export default function Settings() {
  const { data: settings, isLoading } = useGetSettings();
  const update = useUpdateSettings();
  const { toast } = useToast();

  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [idleColor, setIdleColor] = useState("#1a0a2e");
  const [idleBrightness, setIdleBrightness] = useState(20);
  const [idleEnabled, setIdleEnabled] = useState(true);
  const [transitionSpeed, setTransitionSpeed] = useState(500);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [overlayEnabled, setOverlayEnabled] = useState(false);
  const [overlayPort, setOverlayPort] = useState(3001);
  const [overlayConfig, setOverlayConfig] = useState<OverlayConfig>(DEFAULT_OVERLAY_CONFIG);

  useEffect(() => {
    if (settings) {
      setGlobalEnabled(settings.globalEnabled);
      setIdleColor(settings.idleColor);
      setIdleBrightness(settings.idleBrightness);
      setIdleEnabled(settings.idleEnabled);
      setTransitionSpeed(settings.transitionSpeed ?? 500);
      setNotificationsEnabled(settings.notificationsEnabled ?? true);
      setOverlayEnabled(settings.overlayEnabled ?? false);
      setOverlayPort(settings.overlayPort ?? 3001);
      try {
        const raw = (settings as Record<string, unknown>).overlayConfig;
        if (typeof raw === "string" && raw) {
          setOverlayConfig({ ...DEFAULT_OVERLAY_CONFIG, ...JSON.parse(raw) });
        }
      } catch {
        // keep defaults
      }
    }
  }, [settings]);

  const handleSave = () => {
    update.mutate({
      data: {
        globalEnabled, idleColor, idleBrightness, idleEnabled,
        transitionSpeed, notificationsEnabled, overlayEnabled, overlayPort,
        overlayConfig: JSON.stringify(overlayConfig),
      } as Parameters<typeof update.mutate>[0]["data"]
    }, {
      onSuccess: () => toast({ title: "Settings saved!" }),
      onError: () => toast({ title: "Failed to save settings", variant: "destructive" }),
    });
  };

  if (isLoading) return <div className="text-muted-foreground py-4">Loading settings...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground mt-1">Global configuration for Stream Lights.</p>
        </div>
        <Button onClick={handleSave} disabled={update.isPending} className="gap-2">
          <Save className="w-4 h-4" />
          {update.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <div className="space-y-6 max-w-2xl">
        {/* Master Control */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Power className="w-5 h-5 text-primary" />
              Master Control
            </CardTitle>
            <CardDescription>Global on/off switch for all light reactions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">Global Enable</p>
                <p className="text-sm text-muted-foreground">When off, no lights will react to any events.</p>
              </div>
              <Switch checked={globalEnabled} onCheckedChange={setGlobalEnabled} />
            </div>
          </CardContent>
        </Card>

        {/* Idle State */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Idle State</CardTitle>
            <CardDescription>What your lights show when no event is active.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">Enable Idle Color</p>
                <p className="text-sm text-muted-foreground">Return lights to idle color after each event ends.</p>
              </div>
              <Switch checked={idleEnabled} onCheckedChange={setIdleEnabled} />
            </div>
            {idleEnabled && (
              <>
                <div className="grid gap-2">
                  <Label>Idle Color</Label>
                  <div className="flex gap-3">
                    <input
                      type="color" value={idleColor} onChange={e => setIdleColor(e.target.value)}
                      className="w-14 h-10 rounded-md border border-input cursor-pointer p-1 bg-background"
                    />
                    <Input value={idleColor} onChange={e => setIdleColor(e.target.value)} className="font-mono uppercase" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label>Idle Brightness ({idleBrightness}%)</Label>
                  <input type="range" min="0" max="100" value={idleBrightness}
                    onChange={e => setIdleBrightness(Number(e.target.value))}
                    className="w-full accent-primary" />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Transitions */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Transitions</CardTitle>
            <CardDescription>Control how lights transition between states.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-2">
              <Label>Transition Speed ({transitionSpeed}ms)</Label>
              <input type="range" min="0" max="2000" step="50" value={transitionSpeed}
                onChange={e => setTransitionSpeed(Number(e.target.value))}
                className="w-full accent-primary" />
              <p className="text-xs text-muted-foreground">How fast lights fade between colors. 0 = instant snap.</p>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Browser notifications when events fire.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">Browser Notifications</p>
                <p className="text-sm text-muted-foreground">Show browser notifications when events fire.</p>
              </div>
              <Switch checked={notificationsEnabled} onCheckedChange={setNotificationsEnabled} />
            </div>
          </CardContent>
        </Card>

        {/* OBS Overlay */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Monitor className="w-5 h-5 text-primary" />
              OBS Overlay
            </CardTitle>
            <CardDescription>
              On-screen alert banners shown in OBS via a browser source. Requires the desktop agent.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">Enable OBS Overlay</p>
                <p className="text-sm text-muted-foreground">Desktop agent will serve the overlay page locally.</p>
              </div>
              <Switch checked={overlayEnabled} onCheckedChange={setOverlayEnabled} />
            </div>

            {overlayEnabled && (
              <>
                <div className="grid gap-2">
                  <Label>Port</Label>
                  <Input
                    type="number" value={overlayPort}
                    onChange={e => setOverlayPort(Number(e.target.value))}
                    className="max-w-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Add in OBS → Sources → Browser Source → URL:{" "}
                    <code className="bg-muted px-1 rounded">http://localhost:{overlayPort}/overlay</code>
                    {" "}· check <strong>Transparent background</strong>
                  </p>
                </div>

                <div className="border-t border-border pt-5">
                  <p className="font-medium mb-4">Customise the overlay</p>
                  <OverlayCustomizer value={overlayConfig} onChange={setOverlayConfig} />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
