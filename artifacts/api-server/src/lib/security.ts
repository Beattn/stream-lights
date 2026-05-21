import { z } from "zod";

export const VALID_EFFECTS = ["solid", "strobe", "pulse", "rainbow", "fade", "police", "custom"] as const;
export const VALID_PLATFORMS = ["twitch", "youtube", "kick", "streamlabs", "streamelements"] as const;
export const VALID_EVENT_TYPES = [
  "follow", "subscribe", "subscribe_gift", "bits", "donation", "raid", "host",
  "ban", "timeout", "chat_message", "chat_command", "channel_point",
  "stream_live", "light_preview",
] as const;

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a valid hex color (#RRGGBB)");

export const effectSchema = z.enum(VALID_EFFECTS);
export const platformSchema = z.enum(VALID_PLATFORMS);
export const eventTypeSchema = z.enum(VALID_EVENT_TYPES);

export const nameSchema = z.string().min(1).max(200).trim();
export const shortStringSchema = z.string().min(1).max(500).trim();

/**
 * Safely parse a route :id param into a positive integer.
 * Throws a plain Error if the value is not a valid positive integer.
 * Unlike parseInt("1abc") === 1, Number("1abc") === NaN, so this is strict.
 */
export function parseId(param: string): number {
  const n = Number(param);
  if (!Number.isInteger(n) || n <= 0 || n > 2_147_483_647) {
    throw Object.assign(new Error("Invalid ID"), { statusCode: 400 });
  }
  return n;
}

/** Strip a set of keys from an object before sending as JSON */
export function omitKeys<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const out = { ...obj };
  for (const k of keys) delete out[k];
  return out as Omit<T, K>;
}
