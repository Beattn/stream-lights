import WebSocket from "ws";

export interface PlatformEvent {
  eventType: string;
  username: string;
  message: string;
  amount?: number;
}

type Handler = (e: PlatformEvent) => void;

async function getChannelInfo(channelName: string): Promise<{ chatroomId: number } | null> {
  try {
    const res = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(channelName)}`, {
      headers: { Accept: "application/json", "User-Agent": "StreamLightsAgent/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { chatroom?: { id: number } };
    return data.chatroom ? { chatroomId: data.chatroom.id } : null;
  } catch { return null; }
}

export class KickClient {
  private ws: WebSocket | null = null;
  private chatroomId: number | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private shouldRun = false;

  constructor(private channelName: string, private handler: Handler) {}

  async start(): Promise<void> {
    this.shouldRun = true;
    const info = await getChannelInfo(this.channelName);
    if (!info) { console.error(`[Kick] Channel not found: ${this.channelName}`); return; }
    this.chatroomId = info.chatroomId;
    console.log(`[Kick] Connecting to ${this.channelName} (room ${this.chatroomId})`);
    this.connect();
  }

  private connect(): void {
    if (!this.shouldRun || !this.chatroomId) return;
    this.ws = new WebSocket("wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=7.6.0&flash=false");

    this.ws.on("open", () => {
      console.log("[Kick] WebSocket open");
      this.schedulePing();
    });

    this.ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as { event: string; data: string | object };
        if (msg.event === "pusher:connection_established") {
          this.ws!.send(JSON.stringify({ event: "pusher:subscribe", data: { auth: "", channel: `chatrooms.${this.chatroomId}.v2` } }));
          return;
        }
        if (msg.event === "pusher:ping") { this.ws!.send(JSON.stringify({ event: "pusher:pong", data: {} })); return; }

        const data = typeof msg.data === "string" ? JSON.parse(msg.data) as Record<string, unknown> : msg.data as Record<string, unknown>;

        if (msg.event === "App\\Events\\ChatMessageEvent") {
          const content = (data.content as string) ?? "";
          const sender = (data.sender as Record<string, unknown>)?.username as string ?? "unknown";
          this.handler({ eventType: "chat_message", username: sender, message: content });
        } else if (msg.event === "App\\Events\\SubscriptionEvent") {
          const username = (data.username as string) ?? (data.user_username as string) ?? "unknown";
          this.handler({ eventType: "subscribe", username, message: "" });
        } else if (msg.event === "App\\Events\\GiftedSubscriptionsEvent") {
          const gifter = (data.gifted_username as string) ?? "unknown";
          const count = (data.gifted_quantity as number) ?? 1;
          this.handler({ eventType: "subscribe_gift", username: gifter, message: `Gifted ${count} subs`, amount: count });
        } else if (msg.event === "App\\Events\\FollowersUpdated") {
          const username = (data.username as string) ?? "follower";
          this.handler({ eventType: "follow", username, message: "" });
        } else if (msg.event === "App\\Events\\RaidEvent") {
          const raider = (data.raid as Record<string, unknown>)?.host_username as string ?? "raider";
          this.handler({ eventType: "raid", username: raider, message: "" });
        }
      } catch { /* ignore */ }
    });

    this.ws.on("error", (err) => console.warn("[Kick] WS error:", err.message));
    this.ws.on("close", () => {
      this.clearPing();
      console.log("[Kick] WS closed");
      if (this.shouldRun) this.scheduleReconnect();
    });
  }

  private schedulePing(): void {
    this.clearPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ event: "pusher:ping", data: {} }));
    }, 30_000);
  }

  private clearPing(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, 10_000);
  }

  stop(): void {
    this.shouldRun = false;
    this.clearPing();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.ws?.close();
    this.ws = null;
  }

  get isConnected(): boolean { return this.ws?.readyState === WebSocket.OPEN; }
}
