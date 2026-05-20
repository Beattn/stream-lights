import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { applyLight, applyIdle, type Device, type LightParams } from "./drivers";
import { KickClient } from "./kick";
import { TwitchClient } from "./twitch";

interface Trigger {
  id: number;
  name: string;
  eventType: string;
  platform: string | null;
  enabled: boolean;
  color: string;
  brightness: number;
  durationMs: number;
  effect: string;
  returnToIdle: boolean;
  minAmount: number | null;
  deviceIds: number[];
}

interface Settings {
  globalEnabled: boolean;
  idleColor: string;
  idleBrightness: number;
  idleEnabled: boolean;
}

interface Platform {
  platform: string;
  channelName: string | null;
  connected: boolean;
  accessToken: string | null;
  eventsEnabled: boolean;
}

interface Command {
  id: number;
  command: string;
  color: string;
  brightness: number;
  durationMs: number;
  effect: string;
  enabled: boolean;
  cooldownSeconds: number;
}

type StatusCallback = (status: AgentStatus) => void;

export interface AgentStatus {
  running: boolean;
  supabaseConnected: boolean;
  kickConnected: boolean;
  twitchConnected: boolean;
  devicesCount: number;
  triggersCount: number;
  lastEvent: string | null;
  errors: string[];
}

class AlertQueue {
  private queue: Array<{ params: LightParams; deviceIds?: number[]; returnToIdle: boolean }> = [];
  private processing = false;
  private cooldowns = new Map<string, number>();

  enqueue(params: LightParams, opts: { deviceIds?: number[]; returnToIdle?: boolean; key?: string }): void {
    const key = opts.key ?? "default";
    const now = Date.now();
    if (now - (this.cooldowns.get(key) ?? 0) < 500) return;
    this.cooldowns.set(key, now);
    if (this.queue.length >= 8) this.queue.shift();
    this.queue.push({ params, deviceIds: opts.deviceIds, returnToIdle: opts.returnToIdle ?? true });
    if (!this.processing) this.processNext();
  }

  private async processNext(): Promise<void> {
    const item = this.queue.shift();
    if (!item) { this.processing = false; return; }
    this.processing = true;
    try {
      const devices = item.deviceIds?.length
        ? agent.devices.filter((d) => item.deviceIds!.includes(d.id) && d.enabled)
        : agent.devices.filter((d) => d.enabled);

      await Promise.allSettled(devices.map((d) => applyLight(d, item.params)));
      await sleep(item.params.durationMs);

      if (item.returnToIdle && agent.settings?.idleEnabled && this.queue.length === 0) {
        await Promise.allSettled(
          devices.map((d) => applyIdle(d, agent.settings!.idleColor, agent.settings!.idleBrightness))
        );
      }
    } catch (err) {
      console.error("[Queue] Error:", err);
    }
    this.processNext();
  }
}

const queue = new AlertQueue();
const commandCooldowns = new Map<number, number>();

class StreamLightsAgent {
  private supabase: SupabaseClient | null = null;
  private kickClient: KickClient | null = null;
  private twitchClient: TwitchClient | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private statusCallback: StatusCallback | null = null;
  private _running = false;

  devices: Device[] = [];
  triggers: Trigger[] = [];
  commands: Command[] = [];
  settings: Settings | null = null;
  private platforms: Platform[] = [];
  private lastEvent: string | null = null;
  private errors: string[] = [];

  async start(supabaseUrl: string, supabaseKey: string, cb?: StatusCallback): Promise<void> {
    this.statusCallback = cb ?? null;
    console.log("[Agent] Starting...");

    try {
      this.supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
      await this.loadConfig();
      this._running = true;
      this.startPlatforms();
      this.pollTimer = setInterval(() => this.loadConfig(), 30_000);
      this.emitStatus();
      console.log("[Agent] Started — devices:", this.devices.length, "triggers:", this.triggers.length);
    } catch (err) {
      this.errors.push(`Start failed: ${(err as Error).message}`);
      this.emitStatus();
      throw err;
    }
  }

  async stop(): Promise<void> {
    this._running = false;
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    this.kickClient?.stop();
    this.twitchClient?.stop();
    this.kickClient = null;
    this.twitchClient = null;
    this.emitStatus();
  }

  private async loadConfig(): Promise<void> {
    if (!this.supabase) return;
    try {
      const [devRes, trigRes, setRes, platRes, cmdRes] = await Promise.all([
        this.supabase.from("devices").select("*").eq("enabled", true),
        this.supabase.from("triggers").select("*").eq("enabled", true),
        this.supabase.from("settings").select("*").limit(1).single(),
        this.supabase.from("platforms").select("*").eq("connected", true),
        this.supabase.from("commands").select("*").eq("enabled", true),
      ]);

      if (devRes.data) this.devices = devRes.data as Device[];
      if (trigRes.data) {
        this.triggers = (trigRes.data as Trigger[]).map((t) => ({
          ...t,
          deviceIds: (() => { try { return JSON.parse(t.deviceIds as unknown as string) as number[]; } catch { return []; } })(),
        }));
      }
      if (setRes.data) this.settings = setRes.data as Settings;
      if (platRes.data) this.platforms = platRes.data as Platform[];
      if (cmdRes.data) this.commands = cmdRes.data as Command[];

      this.errors = this.errors.filter((e) => !e.startsWith("Config load"));
      this.emitStatus();
    } catch (err) {
      const msg = `Config load failed: ${(err as Error).message}`;
      if (!this.errors.includes(msg)) this.errors.push(msg);
      this.emitStatus();
    }
  }

  private startPlatforms(): void {
    for (const p of this.platforms) {
      if (!p.channelName || !p.eventsEnabled) continue;

      if (p.platform === "kick" && !this.kickClient) {
        this.kickClient = new KickClient(p.channelName, (event) => this.handleEvent(event, "kick"));
        this.kickClient.start();
      }

      if (p.platform === "twitch" && !this.twitchClient) {
        this.twitchClient = new TwitchClient(p.channelName, p.accessToken ?? "", (event) => this.handleEvent(event, "twitch"));
        this.twitchClient.start();
      }
    }
  }

  private async handleEvent(event: { eventType: string; username: string; message: string; amount?: number }, platform: string): Promise<void> {
    this.lastEvent = `${platform}: ${event.eventType} from ${event.username}`;
    console.log(`[Event] ${this.lastEvent}`);

    if (event.eventType === "chat_message") {
      const fired = await this.matchCommand(platform, event.username, event.message);
      if (!fired) await this.matchTriggers(event.eventType, platform, event.username, event.message, event.amount);
    } else {
      await this.matchTriggers(event.eventType, platform, event.username, event.message, event.amount);
    }

    this.emitStatus();
    await this.logActivity(event.eventType, platform, event.username, event.message);
  }

  private async matchTriggers(eventType: string, platform: string, username: string, message: string, amount?: number): Promise<void> {
    if (!this.settings?.globalEnabled) return;

    const matching = this.triggers.filter((t) => {
      if (t.eventType !== eventType) return false;
      if (t.platform && t.platform !== platform) return false;
      if (t.minAmount && amount !== undefined && amount < t.minAmount) return false;
      return true;
    });

    for (const trigger of matching) {
      queue.enqueue(
        { color: trigger.color, brightness: trigger.brightness, effect: trigger.effect, durationMs: trigger.durationMs },
        { deviceIds: trigger.deviceIds.length > 0 ? trigger.deviceIds : undefined, returnToIdle: trigger.returnToIdle, key: `${eventType}:${platform}` }
      );
    }
  }

  private async matchCommand(platform: string, username: string, message: string): Promise<boolean> {
    if (!message.startsWith("!")) return false;
    const cmd = message.split(" ")[0]?.toLowerCase() ?? "";
    const command = this.commands.find((c) => c.command === cmd);
    if (!command) return false;

    const now = Date.now();
    const last = commandCooldowns.get(command.id) ?? 0;
    if (now - last < command.cooldownSeconds * 1000) return false;

    commandCooldowns.set(command.id, now);
    queue.enqueue(
      { color: command.color, brightness: command.brightness, effect: command.effect, durationMs: command.durationMs },
      { returnToIdle: true, key: `cmd:${cmd}` }
    );

    void this.supabase?.from("commands").update({ usage_count: command.id + 1 }).eq("id", command.id);
    return true;
  }

  private async logActivity(eventType: string, platform: string, username: string, message: string): Promise<void> {
    void this.supabase?.from("activity").insert({ event_type: eventType, platform, username, message });
  }

  async testLight(color: string, brightness: number, effect: string, durationMs: number): Promise<void> {
    if (!this.settings?.globalEnabled) return;
    queue.enqueue({ color, brightness, effect, durationMs }, { returnToIdle: true, key: "test" });
  }

  getStatus(): AgentStatus {
    return {
      running: this._running,
      supabaseConnected: this.supabase !== null && this.devices.length >= 0,
      kickConnected: this.kickClient?.isConnected ?? false,
      twitchConnected: this.twitchClient?.isConnected ?? false,
      devicesCount: this.devices.length,
      triggersCount: this.triggers.length,
      lastEvent: this.lastEvent,
      errors: [...this.errors],
    };
  }

  private emitStatus(): void {
    this.statusCallback?.(this.getStatus());
  }
}

export const agent = new StreamLightsAgent();
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
