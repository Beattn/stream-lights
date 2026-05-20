import { useState, useRef } from "react";
import { Download, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api";

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

const JOB_POLL_INTERVAL_MS = 3_000;
const JOB_TIMEOUT_MS = 150_000; // 2.5 min

export default function AudioFetchButton({ url, onFetched }: Props) {
  const [state, setState] = useState<"idle" | "fetching" | "waiting" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef<number>(0);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  async function pollJob(jobId: string) {
    if (Date.now() > deadlineRef.current) {
      stopPolling();
      setErrorMsg("The desktop agent didn't respond in time. Make sure it is running and signed in, then try again.");
      setState("error");
      return;
    }

    try {
      const res = await fetch(apiUrl(`/api/audio/jobs/${jobId}`));
      const data = await res.json() as { status: string; url?: string; title?: string; error?: string };

      if (data.status === "done" && data.url) {
        stopPolling();
        setState("done");
        onFetched(data.url);
        setTimeout(() => setState("idle"), 3000);
      } else if (data.status === "failed") {
        stopPolling();
        setErrorMsg(data.error ?? "Desktop agent failed to download the audio.");
        setState("error");
      } else if (data.status === "processing") {
        setStatusMsg("Downloading on your PC…");
      } else {
        setStatusMsg("Waiting for desktop agent…");
      }
    } catch {
      // network hiccup — keep polling
    }
  }

  const fetch_ = async () => {
    setState("fetching");
    setErrorMsg("");
    setStatusMsg("");
    stopPolling();

    try {
      const res = await fetch(apiUrl("/api/audio/fetch"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      let data: Record<string, unknown> = {};
      try { data = await res.json(); } catch { /* empty body */ }

      if (!res.ok) {
        throw new Error((data.error as string) ?? `Server error (${res.status})`);
      }

      // Server-side download (non-YouTube): returns url directly
      if (data.url) {
        setState("done");
        onFetched(data.url as string);
        setTimeout(() => setState("idle"), 3000);
        return;
      }

      // YouTube: returns jobId — poll until desktop agent finishes
      if (data.jobId) {
        setState("waiting");
        setStatusMsg("Waiting for desktop agent…");
        deadlineRef.current = Date.now() + JOB_TIMEOUT_MS;
        const jobId = data.jobId as string;
        pollRef.current = setInterval(() => void pollJob(jobId), JOB_POLL_INTERVAL_MS);
        // Poll once immediately
        void pollJob(jobId);
        return;
      }

      throw new Error("No URL or job returned from server.");
    } catch (err) {
      stopPolling();
      setErrorMsg(err instanceof Error ? err.message : "Failed to fetch audio");
      setState("error");
    }
  };

  const isYT = /youtu/i.test(url);
  const isWaiting = state === "waiting";

  const label = isYT ? "Download from YouTube" : "Fetch audio";
  const loadingLabel = isWaiting
    ? statusMsg || "Waiting for desktop agent…"
    : isYT ? "Queuing download…" : "Fetching…";

  const busy = state === "fetching" || state === "waiting";

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs h-9 shrink-0 whitespace-nowrap border-primary/40 text-primary hover:bg-primary/10"
        disabled={busy}
        onClick={fetch_}
      >
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {state === "done" && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
        {state === "error" && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
        {!busy && state !== "done" && state !== "error" && <Download className="w-3.5 h-3.5" />}
        {busy ? loadingLabel : state === "done" ? "Ready!" : label}
      </Button>

      {isWaiting && (
        <p className="text-xs text-muted-foreground leading-snug max-w-xs">
          Your desktop agent is downloading the audio on your PC. Keep it running…
        </p>
      )}

      {state === "error" && (
        <p className="text-xs text-destructive leading-snug max-w-xs">{errorMsg}</p>
      )}
    </div>
  );
}
