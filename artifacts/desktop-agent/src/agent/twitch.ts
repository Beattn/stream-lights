import WebSocket from "ws";
import type { PlatformEvent } from "./kick";

export { PlatformEvent };
type Handler = (e: PlatformEvent) => void;

export class TwitchClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private shouldRun = false;
  private reconnectAttempts = 0;

  constructor(
    private channelName: string,
    private oauthToken: string,
    private handler: Handler,
    private botUsername = "justinfan77777"
  ) {
    this.channelName = channelName.toLowerCase();
  }

  start(): void {
    this.shouldRun = true;
    console.log(`[Twitch] Connecting to #${this.channelName}`);
    this.connect();
  }

  private connect(): void {
    if (!this.shouldRun) return;
    this.ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");

    this.ws.on("open", () => {
      this.reconnectAttempts = 0;
      this.ws!.send("CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership");
      if (this.oauthToken) this.ws!.send(`PASS oauth:${this.oauthToken.replace(/^oauth:/, "")}`);
      this.ws!.send(`NICK ${this.botUsername}`);
      this.ws!.send(`JOIN #${this.channelName}`);
      console.log(`[Twitch] Joined #${this.channelName}`);
      this.schedulePing();
    });

    this.ws.on("message", (raw: Buffer) => {
      const lines = raw.toString().split("\r\n").filter(Boolean);
      for (const line of lines) this.parseLine(line);
    });

    this.ws.on("error", (err) => console.warn("[Twitch] WS error:", err.message));
    this.ws.on("close", () => {
      this.clearPing();
      if (this.shouldRun) this.scheduleReconnect();
    });
  }

  private parseLine(line: string): void {
    if (line.startsWith("PING")) { this.ws?.send("PONG :tmi.twitch.tv"); return; }

    const tags = this.parseTags(line);
    const parts = line.startsWith("@") ? line.slice(line.indexOf(" ") + 1) : line;

    if (parts.includes("PRIVMSG")) {
      const userMatch = parts.match(/^:(\w+)!/);
      const username = userMatch?.[1] ?? tags["display-name"] ?? "unknown";
      const msgMatch = parts.match(/PRIVMSG #\w+ :(.+)/);
      const message = msgMatch?.[1] ?? "";
      const bits = parseInt(tags["bits"] ?? "0", 10);

      if (bits > 0) {
        this.handler({ eventType: "bits", username, message, amount: bits });
      }
      this.handler({ eventType: "chat_message", username, message });
    } else if (parts.includes("CLEARCHAT")) {
      // CLEARCHAT #channel :username  = ban or timeout on that user
      const targetMatch = parts.match(/CLEARCHAT #\w+ :(\w+)/);
      if (targetMatch) {
        const target = tags["target-user-login"] ?? targetMatch[1] ?? "unknown";
        const banDuration = tags["ban-duration"];
        if (banDuration) {
          const duration = parseInt(banDuration, 10);
          this.handler({ eventType: "timeout", username: target, message: `Timed out ${duration}s`, amount: duration });
        } else {
          this.handler({ eventType: "ban", username: target, message: "Banned" });
        }
      }
    } else if (parts.includes("USERNOTICE")) {
      const msgId = tags["msg-id"] ?? "";
      const username = tags["display-name"] ?? tags["login"] ?? "unknown";
      const msgMatch = parts.match(/USERNOTICE #\w+ :(.+)/);
      const message = msgMatch?.[1] ?? "";

      if (msgId === "sub" || msgId === "resub") {
        this.handler({ eventType: "subscribe", username, message });
      } else if (msgId === "subgift" || msgId === "anonsubgift") {
        this.handler({ eventType: "subscribe_gift", username, message: "Gift sub", amount: 1 });
      } else if (msgId === "submysterygift") {
        const count = parseInt(tags["msg-param-mass-gift-count"] ?? "1", 10);
        this.handler({ eventType: "subscribe_gift", username, message: `${count} gift subs`, amount: count });
      } else if (msgId === "raid") {
        const viewers = parseInt(tags["msg-param-viewerCount"] ?? "0", 10);
        this.handler({ eventType: "raid", username, message, amount: viewers });
      }
    }
  }

  private parseTags(line: string): Record<string, string> {
    if (!line.startsWith("@")) return {};
    const tagStr = line.slice(1, line.indexOf(" "));
    const tags: Record<string, string> = {};
    for (const kv of tagStr.split(";")) {
      const [k, v] = kv.split("=");
      if (k) tags[k] = v ?? "";
    }
    return tags;
  }

  private schedulePing(): void {
    this.clearPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send("PING :tmi.twitch.tv");
    }, 60_000);
  }

  private clearPing(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    // Exponential backoff: 2s, 4s, 8s, 16s, 32s, 60s max
    const delay = Math.min(2_000 * Math.pow(2, this.reconnectAttempts), 60_000);
    this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, 5);
    console.log(`[Twitch] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, delay);
  }

  get channel(): string { return this.channelName; }

  stop(): void {
    this.shouldRun = false;
    this.clearPing();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.ws?.close();
    this.ws = null;
  }

  get isConnected(): boolean { return this.ws?.readyState === WebSocket.OPEN; }
}
