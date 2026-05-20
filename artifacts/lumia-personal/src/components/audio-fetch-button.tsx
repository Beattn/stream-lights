import { useState } from "react";
import { Download, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  url: string;
  onFetched: (hostedUrl: string) => void;
}

const PLATFORM_PATTERNS = [
  /youtube\.com/i, /youtu\.be/i,
  /soundcloud\.com/i,
  /open\.spotify\.com/i,
  /music\.apple\.com/i,
  /tidal\.com/i,
  /deezer\.com/i,
  /twitch\.tv/i,
  /vimeo\.com/i,
  /dailymotion\.com/i,
];

const DIRECT_AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|aac|flac|m4a|webm|opus)(\?.*)?$/i;

export function isPlatformUrl(url: string): boolean {
  if (!url) return false;
  try { new URL(url); } catch { return false; }
  if (DIRECT_AUDIO_EXTENSIONS.test(url)) return false;
  return PLATFORM_PATTERNS.some(p => p.test(url));
}

export function isNonAudioUrl(url: string): boolean {
  if (!url) return false;
  if (!url.startsWith("http://") && !url.startsWith("https://")) return false;
  if (DIRECT_AUDIO_EXTENSIONS.test(url)) return false;
  try { new URL(url); return true; } catch { return false; }
}

export default function AudioFetchButton({ url, onFetched }: Props) {
  const [state, setState] = useState<"idle" | "fetching" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const fetch_ = async () => {
    setState("fetching");
    setErrorMsg("");
    try {
      const res = await fetch("/api/audio/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Fetch failed");
      setState("done");
      onFetched(data.url as string);
      setTimeout(() => setState("idle"), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to fetch audio");
      setState("error");
    }
  };

  const isYT = /youtu/i.test(url);
  const label = isYT ? "Download from YouTube" : "Fetch audio";
  const loadingLabel = isYT ? "Downloading…" : "Fetching…";

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs h-9 shrink-0 whitespace-nowrap border-primary/40 text-primary hover:bg-primary/10"
        disabled={state === "fetching"}
        onClick={fetch_}
      >
        {state === "fetching" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {state === "done" && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
        {state === "error" && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
        {state === "idle" && <Download className="w-3.5 h-3.5" />}
        {state === "fetching" ? loadingLabel : state === "done" ? "Ready!" : label}
      </Button>
      {state === "error" && (
        <p className="text-xs text-destructive leading-snug max-w-xs">{errorMsg}</p>
      )}
    </div>
  );
}
