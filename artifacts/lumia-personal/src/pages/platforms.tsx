import { useState } from "react";
import {
  useListPlatforms, useConnectPlatform, useDisconnectPlatform,
} from "@workspace/api-client-react";
import { Globe, Link2, Unlink, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const PLATFORM_DEFS = [
  {
    id: "twitch",
    name: "Twitch",
    description: "Followers, subscribers, bits, raids, channel points and more.",
    color: "#9146FF",
    events: ["follow", "subscribe", "bits", "raid", "channel_point", "ban", "timeout"],
  },
  {
    id: "youtube",
    name: "YouTube",
    description: "Super chats, members, and live chat events.",
    color: "#FF0000",
    events: ["subscribe", "donation", "chat_message"],
  },
  {
    id: "kick",
    name: "Kick",
    description: "Followers, subscriptions, gifted subs, raids, and chat commands.",
    color: "#53FC18",
    events: ["follow", "subscribe", "subscribe_gift", "raid", "chat_message"],
  },
  {
    id: "streamlabs",
    name: "Streamlabs",
    description: "Donations, alerts, and Streamlabs events.",
    color: "#80F5D2",
    events: ["donation", "follow", "subscribe"],
  },
  {
    id: "streamelements",
    name: "StreamElements",
    description: "Tips, merch and StreamElements event system.",
    color: "#F5A623",
    events: ["donation", "follow"],
  },
];

export default function Platforms() {
  const { data: platforms } = useListPlatforms();

  const connectedMap: Record<string, any> = {};
  platforms?.forEach(p => { connectedMap[p.platform] = p; });

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Platforms</h1>
        <p className="text-muted-foreground mt-1">Connect streaming platforms to receive live events.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {PLATFORM_DEFS.map((def) => {
          const conn = connectedMap[def.id];
          return (
            <PlatformCard key={def.id} def={def} connection={conn} />
          );
        })}
      </div>
    </div>
  );
}

function PlatformCard({ def, connection }: { def: typeof PLATFORM_DEFS[0], connection: any }) {
  const disconnect = useDisconnectPlatform();
  const { toast } = useToast();
  const isConnected = connection?.connected === true;

  const handleDisconnect = () => {
    disconnect.mutate({ platform: def.id }, {
      onSuccess: () => toast({ title: `Disconnected from ${def.name}.` }),
      onError: () => toast({ title: `Failed to disconnect from ${def.name}`, variant: "destructive" }),
    });
  };

  return (
    <Card className="border-border bg-card overflow-hidden">
      <div className="h-1 w-full" style={{ backgroundColor: def.color }} />
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <span style={{ color: def.color }}>{def.name}</span>
              {isConnected
                ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                : <XCircle className="w-5 h-5 text-muted-foreground" />
              }
            </CardTitle>
            {connection?.channelName && (
              <p className="text-sm text-primary font-mono mt-0.5">@{connection.channelName}</p>
            )}
          </div>
          <div className={`text-xs px-2 py-1 rounded-full font-bold uppercase tracking-wider ${isConnected ? "bg-green-500/10 text-green-500 border border-green-500/20" : "bg-muted text-muted-foreground border border-border"}`}>
            {isConnected ? "Connected" : "Disconnected"}
          </div>
        </div>
        <CardDescription className="mt-2">{def.description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="mb-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-2">Supported Events</p>
          <div className="flex flex-wrap gap-1.5">
            {def.events.map(ev => (
              <span key={ev} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border capitalize">
                {ev.replace("_", " ")}
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnect.isPending}
              className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            >
              <Unlink className="w-3.5 h-3.5" />
              Disconnect
            </Button>
          ) : (
            <ConnectModal def={def} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ConnectModal({ def }: { def: typeof PLATFORM_DEFS[0] }) {
  const [open, setOpen] = useState(false);
  const connect = useConnectPlatform();
  const { toast } = useToast();

  const [channelName, setChannelName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const handleConnect = () => {
    connect.mutate({ platform: def.id, data: { channelName, clientId, clientSecret, accessToken } }, {
      onSuccess: () => {
        toast({ title: `Connected to ${def.name}!` });
        setOpen(false);
        setChannelName(""); setClientId(""); setClientSecret(""); setAccessToken("");
      },
      onError: () => toast({ title: `Failed to connect to ${def.name}`, variant: "destructive" }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2" style={{ backgroundColor: def.color + "22", borderColor: def.color + "55", color: def.color }}>
          <Link2 className="w-3.5 h-3.5" />
          Connect
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect {def.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Channel / Username</Label>
            <Input value={channelName} onChange={e => setChannelName(e.target.value)} placeholder={`Your ${def.name} channel name`} />
          </div>
          <div className="grid gap-2">
            <Label>Client ID (optional)</Label>
            <Input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="App Client ID" />
          </div>
          <div className="grid gap-2">
            <Label>Client Secret (optional)</Label>
            <Input value={clientSecret} onChange={e => setClientSecret(e.target.value)} type="password" placeholder="App Client Secret" />
          </div>
          <div className="grid gap-2">
            <Label>Access Token (optional)</Label>
            <Input value={accessToken} onChange={e => setAccessToken(e.target.value)} type="password" placeholder="OAuth Access Token" />
          </div>
          <p className="text-xs text-muted-foreground">
            You can connect with just your channel name to set up the platform. Add API credentials when you're ready to receive live events.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleConnect} disabled={connect.isPending || !channelName}>Connect</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
