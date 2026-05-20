import { useRef, useState, useEffect, useCallback } from "react";
import { Play, Square, Loader2, FolderOpen, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  url: string;
  startMs: number;
  endMs: number | null;
  onChange: (startMs: number, endMs: number) => void;
}

function fmt(ms: number) {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1).padStart(4, "0");
  return m > 0 ? `${m}:${sec}` : `${sec}s`;
}

function isLocalPath(url: string) {
  if (!url) return false;
  // Windows absolute paths: C:\... or C:/...
  if (/^[a-zA-Z]:[/\\]/.test(url)) return true;
  // UNC paths: \\server\...
  if (url.startsWith("\\\\")) return true;
  // Unix absolute paths (not http/https/blob/data)
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  return false;
}

function isWebUrl(url: string) {
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:");
}

const STREAMING_PATTERNS = [
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

function isStreamingUrl(url: string) {
  if (!url) return false;
  const DIRECT_EXT = /\.(mp3|wav|ogg|aac|flac|m4a|webm|opus)(\?.*)?$/i;
  if (DIRECT_EXT.test(url)) return false;
  return STREAMING_PATTERNS.some(p => p.test(url));
}

/** Manual start/end inputs used when we can't load the audio in the browser */
function ManualInputs({
  startMs,
  endMs,
  onChange,
  hint,
}: {
  startMs: number;
  endMs: number | null;
  onChange: (s: number, e: number) => void;
  hint: React.ReactNode;
}) {
  const effectiveEnd = endMs ?? 0;

  return (
    <div className="space-y-2">
      {hint}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Start (s)</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={(startMs / 1000).toFixed(1)}
            onChange={e => {
              const s = Math.max(0, parseFloat(e.target.value) || 0);
              onChange(Math.round(s * 1000), effectiveEnd > 0 ? effectiveEnd : Math.round((s + 30) * 1000));
            }}
            className="w-20 h-7 rounded-md border border-input bg-background px-2 text-xs font-mono"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">End (s)</span>
          <input
            type="number"
            min={0}
            step={0.1}
            value={effectiveEnd > 0 ? (effectiveEnd / 1000).toFixed(1) : ""}
            placeholder="full"
            onChange={e => {
              const val = e.target.value;
              if (!val) { onChange(startMs, 0); return; }
              const s = Math.max((startMs + 100) / 1000, parseFloat(val) || 0);
              onChange(startMs, Math.round(s * 1000));
            }}
            className="w-20 h-7 rounded-md border border-input bg-background px-2 text-xs font-mono"
          />
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {effectiveEnd > startMs ? fmt(effectiveEnd - startMs) + " clip" : "full clip"}
        </span>
      </div>
    </div>
  );
}

export default function AudioClipPicker({ url, startMs, endMs, onChange }: Props) {
  const [duration, setDuration] = useState(0);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error" | "local" | "streaming">("idle");
  const [previewing, setPreviewing] = useState(false);
  // blob URL created from a picked local file, used for browser preview only
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const trackRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const draggingRef = useRef<"start" | "end" | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveEnd = endMs ?? duration;
  const audioSrc = blobUrl ?? url;

  // When url changes, drop any blob URL we made
  useEffect(() => {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }
    setLoadState("idle");
    setDuration(0);
  }, [url]);

  // Load audio metadata from the resolved source
  useEffect(() => {
    const src = blobUrl ?? url;
    if (!src || (!isWebUrl(src) && !blobUrl)) {
      setLoadState("local");
      return;
    }
    if (!blobUrl && isStreamingUrl(src)) {
      setLoadState("streaming");
      return;
    }

    setLoadState("loading");
    const audio = new Audio();
    audio.preload = "metadata";

    const onMeta = () => {
      const dur = Math.round(audio.duration * 1000);
      setDuration(dur);
      setLoadState("ready");
      if (endMs === null || endMs > dur) {
        onChange(startMs, dur);
      }
      audio.remove();
    };
    const onError = () => {
      setLoadState("error");
      audio.remove();
    };

    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("error", onError);
    audio.src = src;
    audio.load();

    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("error", onError);
    };
  }, [url, blobUrl]);

  const posToMs = useCallback((clientX: number): number => {
    const track = trackRef.current;
    if (!track || duration === 0) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(ratio * duration);
  }, [duration]);

  const onPointerDown = (e: React.PointerEvent, handle: "start" | "end") => {
    e.preventDefault();
    draggingRef.current = handle;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onTrackPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || duration === 0) return;
    const ms = posToMs(e.clientX);
    if (draggingRef.current === "start") {
      onChange(Math.max(0, Math.min(ms, effectiveEnd - 100)), effectiveEnd);
    } else {
      onChange(startMs, Math.min(Math.max(ms, startMs + 100), duration));
    }
  }, [duration, startMs, effectiveEnd, posToMs, onChange]);

  const onTrackPointerUp = () => { draggingRef.current = null; };

  const startPreview = () => {
    stopPreview();
    const audio = new Audio(audioSrc);
    audio.currentTime = startMs / 1000;
    audio.volume = 1;
    previewRef.current = audio;
    setPreviewing(true);
    audio.play().catch(() => setPreviewing(false));
    previewTimerRef.current = setTimeout(() => stopPreview(), (effectiveEnd - startMs) + 200);
  };

  const stopPreview = () => {
    previewRef.current?.pause();
    previewRef.current = null;
    if (previewTimerRef.current) { clearTimeout(previewTimerRef.current); previewTimerRef.current = null; }
    setPreviewing(false);
  };

  useEffect(() => () => stopPreview(), []);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    const newBlob = URL.createObjectURL(file);
    setBlobUrl(newBlob);
    setLoadState("loading");
  };

  // ── Streaming URL (YouTube, Spotify, etc.) ──────────────────────────────
  if (loadState === "streaming") {
    return (
      <div className="space-y-2">
        <ManualInputs
          startMs={startMs}
          endMs={endMs}
          onChange={onChange}
          hint={
            <div className="flex items-start gap-2 rounded-md bg-blue-500/10 border border-blue-500/20 px-3 py-2">
              <p className="text-xs text-blue-400 leading-relaxed">
                This is a streaming URL — the browser can't play it directly.
                Use the <strong>Download from YouTube</strong> button above to save a hosted copy first,
                or{" "}
                <button
                  type="button"
                  className="underline hover:opacity-80 transition-opacity"
                  onClick={() => fileInputRef.current?.click()}
                >
                  upload your own file
                </button>
                {" "}to get the visual timeline.
              </p>
            </div>
          }
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleFilePick}
        />
      </div>
    );
  }

  // ── Local path: no browser preview possible ─────────────────────────────
  if (loadState === "local") {
    return (
      <div className="space-y-2">
        <ManualInputs
          startMs={startMs}
          endMs={endMs}
          onChange={onChange}
          hint={
            <div className="flex items-start gap-2 rounded-md bg-muted/60 border border-border px-3 py-2">
              <HardDrive className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Local file path detected — the agent will play it directly from your PC.
                Set start/end times manually, or{" "}
                <button
                  type="button"
                  className="underline text-primary hover:text-primary/80 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  browse the file
                </button>
                {" "}to get a visual timeline.
              </p>
            </div>
          }
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleFilePick}
        />
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loadState === "idle" || loadState === "loading") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {loadState === "loading" ? "Loading audio…" : ""}
      </div>
    );
  }

  // ── Error: URL failed to load ────────────────────────────────────────────
  if (loadState === "error") {
    return (
      <div className="space-y-2">
        <ManualInputs
          startMs={startMs}
          endMs={endMs}
          onChange={onChange}
          hint={
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
              <p className="text-xs text-destructive/90 leading-relaxed">
                Couldn't load the audio URL for preview — make sure it's a direct link to an audio file (not a streaming page).
                You can still set clip times manually below, or{" "}
                <button
                  type="button"
                  className="underline hover:opacity-80 transition-opacity"
                  onClick={() => fileInputRef.current?.click()}
                >
                  browse your PC for the file
                </button>
                {" "}to get the visual timeline.
              </p>
            </div>
          }
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleFilePick}
        />
      </div>
    );
  }

  // ── Ready: full timeline UI ──────────────────────────────────────────────
  const startPct = duration > 0 ? (startMs / duration) * 100 : 0;
  const endPct = duration > 0 ? (effectiveEnd / duration) * 100 : 100;
  const clipDuration = effectiveEnd - startMs;

  return (
    <div className="space-y-3">
      {blobUrl && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FolderOpen className="w-3 h-3" />
          <span>Previewing local file in browser — clip times will be saved.</span>
        </div>
      )}

      {/* Timeline track */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>0s</span>
          <span className="text-primary font-medium">{fmt(clipDuration)} selected</span>
          <span>{fmt(duration)}</span>
        </div>

        <div
          ref={trackRef}
          className="relative h-8 bg-muted rounded-lg overflow-visible cursor-crosshair select-none"
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
        >
          <div className="absolute inset-0 rounded-lg bg-muted border border-border" />

          <div
            className="absolute top-0 bottom-0 bg-primary/20 border-y border-primary/40"
            style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
          />

          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="absolute top-1 bottom-1 w-px bg-border/50" style={{ left: `${(i + 1) * 10}%` }} />
          ))}

          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-6 rounded bg-primary border-2 border-primary-foreground shadow-md cursor-ew-resize z-10 flex items-center justify-center"
            style={{ left: `${startPct}%` }}
            onPointerDown={e => onPointerDown(e, "start")}
            onPointerMove={onTrackPointerMove}
            onPointerUp={onTrackPointerUp}
          >
            <div className="w-0.5 h-3 bg-primary-foreground/60 rounded-full" />
          </div>

          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-6 rounded bg-primary border-2 border-primary-foreground shadow-md cursor-ew-resize z-10 flex items-center justify-center"
            style={{ left: `${endPct}%` }}
            onPointerDown={e => onPointerDown(e, "end")}
            onPointerMove={onTrackPointerMove}
            onPointerUp={onTrackPointerUp}
          >
            <div className="w-0.5 h-3 bg-primary-foreground/60 rounded-full" />
          </div>
        </div>

        <div className="relative h-4">
          <span className="absolute text-xs text-primary font-mono -translate-x-1/2" style={{ left: `${startPct}%` }}>
            {fmt(startMs)}
          </span>
          <span className="absolute text-xs text-primary font-mono -translate-x-1/2" style={{ left: `${endPct}%` }}>
            {fmt(effectiveEnd)}
          </span>
        </div>
      </div>

      {/* Fine-tune inputs + preview */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Start (s)</span>
          <input
            type="number"
            min={0}
            max={(effectiveEnd - 0.1).toFixed(1)}
            step={0.1}
            value={(startMs / 1000).toFixed(1)}
            onChange={e => {
              const s = Math.max(0, Math.min(parseFloat(e.target.value) || 0, (effectiveEnd - 100) / 1000));
              onChange(Math.round(s * 1000), effectiveEnd);
            }}
            className="w-20 h-7 rounded-md border border-input bg-background px-2 text-xs font-mono"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">End (s)</span>
          <input
            type="number"
            min={((startMs + 100) / 1000).toFixed(1)}
            max={(duration / 1000).toFixed(1)}
            step={0.1}
            value={(effectiveEnd / 1000).toFixed(1)}
            onChange={e => {
              const s = Math.min(duration / 1000, Math.max(parseFloat(e.target.value) || 0, (startMs + 100) / 1000));
              onChange(startMs, Math.round(s * 1000));
            }}
            className="w-20 h-7 rounded-md border border-input bg-background px-2 text-xs font-mono"
          />
        </div>
        <div className="ml-auto flex gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="gap-1.5 h-7 text-xs text-muted-foreground"
            title="Browse a different file"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={previewing ? stopPreview : startPreview}
            className="gap-1.5 h-7 text-xs"
          >
            {previewing
              ? <><Square className="w-3 h-3 fill-current" /> Stop</>
              : <><Play className="w-3 h-3" /> Preview clip</>
            }
          </Button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFilePick}
      />
    </div>
  );
}
