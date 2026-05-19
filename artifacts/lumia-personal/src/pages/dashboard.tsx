import { useState } from "react";
import { 
  useGetDashboardStats, 
  useListActivity, 
  usePreviewLight,
  DashboardStats 
} from "@workspace/api-client-react";
import { 
  Zap, 
  Activity, 
  LightbulbOff, 
  MessageSquare, 
  Globe, 
  RadioReceiver,
  ListVideo
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: stats } = useGetDashboardStats({ query: { refetchInterval: 10000 } });
  const { data: activity } = useListActivity({ limit: 15 }, { query: { refetchInterval: 5000 } });
  
  return (
    <div className="space-y-8 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mission Control</h1>
          <p className="text-muted-foreground mt-1">Live stream light status and activity.</p>
        </div>
        <PreviewLightModal />
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard 
            title="Online Devices" 
            value={`${stats.onlineDevices} / ${stats.totalDevices}`} 
            icon={LightbulbOff} 
            color="text-primary"
          />
          <StatCard 
            title="Active Platforms" 
            value={stats.activePlatforms} 
            icon={Globe} 
            color="text-blue-500"
          />
          <StatCard 
            title="Active Triggers" 
            value={`${stats.activeTriggers} / ${stats.totalTriggers}`} 
            icon={Zap} 
            color="text-yellow-500"
          />
          <StatCard 
            title="Events Today" 
            value={stats.eventsToday} 
            icon={Activity} 
            color="text-green-500"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 border-border bg-card">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <RadioReceiver className="w-5 h-5 text-primary" />
              Live Activity Feed
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50 max-h-[500px] overflow-y-auto">
              {!activity?.length ? (
                <div className="p-8 text-center text-muted-foreground">
                  No recent activity. Go live to see events!
                </div>
              ) : (
                activity.map((entry) => (
                  <div key={entry.id} className="p-4 hover:bg-muted/30 transition-colors flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center bg-muted shrink-0 relative overflow-hidden">
                      {entry.colorTriggered && (
                        <div 
                          className="absolute inset-0 opacity-20" 
                          style={{ backgroundColor: entry.colorTriggered }} 
                        />
                      )}
                      <Zap className="w-5 h-5 relative z-10" style={{ color: entry.colorTriggered || 'currentColor' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold truncate">{entry.username || 'System'}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 uppercase tracking-wider font-bold">
                          {entry.eventType}
                        </span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {format(new Date(entry.triggeredAt), 'HH:mm:ss')}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground truncate mt-1">
                        {entry.message || `Triggered via ${entry.platform}`}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <ListVideo className="w-5 h-5 text-primary" />
              Top Events Today
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-4">
              {stats?.topEventTypes.map((type, i) => (
                <div key={type.eventType} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center text-sm font-bold text-muted-foreground">{i + 1}</span>
                    <span className="capitalize">{type.eventType.replace('_', ' ')}</span>
                  </div>
                  <span className="font-mono bg-muted px-2 py-1 rounded text-sm">{type.count}</span>
                </div>
              ))}
              {(!stats?.topEventTypes || stats.topEventTypes.length === 0) && (
                <div className="text-center text-muted-foreground py-4">No events yet today.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }: { title: string, value: string | number, icon: any, color: string }) {
  return (
    <Card className="border-border bg-card relative overflow-hidden group">
      <div className={`absolute top-0 right-0 p-4 opacity-10 transition-transform group-hover:scale-110 group-hover:opacity-20 ${color}`}>
        <Icon className="w-24 h-24" />
      </div>
      <CardContent className="p-6 relative z-10">
        <p className="text-sm font-medium text-muted-foreground mb-2">{title}</p>
        <p className="text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function PreviewLightModal() {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState("#ff00ff");
  const [effect, setEffect] = useState("pulse");
  const [brightness, setBrightness] = useState(100);
  
  const previewLight = usePreviewLight();
  const { toast } = useToast();

  const handleFire = () => {
    previewLight.mutate(
      { data: { color, effect, brightness, durationMs: 2000 } },
      {
        onSuccess: () => {
          toast({ title: "Light test fired!" });
          setOpen(false);
        },
        onError: () => {
          toast({ title: "Failed to fire light test", variant: "destructive" });
        }
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all hover:shadow-[0_0_30px_rgba(168,85,247,0.6)]">
          <Zap className="w-5 h-5 fill-current" />
          Quick Fire Test
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-card border-border">
        <DialogHeader>
          <DialogTitle>Test Lights</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          <div className="grid gap-2">
            <Label>Color</Label>
            <div className="flex gap-3">
              <Input 
                type="color" 
                value={color} 
                onChange={(e) => setColor(e.target.value)} 
                className="w-14 h-14 p-1 cursor-pointer"
              />
              <Input 
                value={color} 
                onChange={(e) => setColor(e.target.value)} 
                className="flex-1 font-mono uppercase"
              />
            </div>
          </div>
          
          <div className="grid gap-2">
            <Label>Effect</Label>
            <select 
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={effect}
              onChange={(e) => setEffect(e.target.value)}
            >
              <option value="solid">Solid</option>
              <option value="strobe">Strobe</option>
              <option value="pulse">Pulse</option>
              <option value="rainbow">Rainbow</option>
              <option value="fade">Fade</option>
              <option value="police">Police</option>
            </select>
          </div>

          <div className="grid gap-2">
            <Label>Brightness ({brightness}%)</Label>
            <input 
              type="range" 
              min="1" max="100" 
              value={brightness} 
              onChange={(e) => setBrightness(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleFire} 
            disabled={previewLight.isPending}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {previewLight.isPending ? "Firing..." : "Fire Test"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
