import { useRef, useState, useEffect, useCallback } from "react";
import { Play, Square, Loader2 } from "lucide-react";
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

export default function AudioClipPicker({ url, startMs, endMs, onChange }: Props) {
  const [duration, setDuration] = useState(0);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [previewing, setPreviewing] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const draggingRef = useRef<"start" | "end" | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveEnd = endMs ?? duration;

  // Load audio metadata to get duration
  useEffect(() => {
    if (!url) return;
    setLoadState("loading");
    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.preload = "metadata";

    const onMeta = () => {
      const dur = Math.round(audio.duration * 1000);
      setDuration(dur);
      setLoadState("ready");
      // Set end to full duration if not set or exceeds duration
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
    audio.src = url;
    audio.load();

    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("error", onError);
    };
  }, [url]);

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
      const newStart = Math.min(ms, effectiveEnd - 100);
      onChange(Math.max(0, newStart), effectiveEnd);
    } else {
      const newEnd = Math.max(ms, startMs + 100);
      onChange(startMs, Math.min(newEnd, duration));
    }
  }, [duration, startMs, effectiveEnd, posToMs, onChange]);

  const onTrackPointerUp = () => {
    draggingRef.current = null;
  };

  const startPreview = () => {
    stopPreview();
    const audio = new Audio(url);
    audio.currentTime = startMs / 1000;
    audio.volume = 1;
    previewRef.current = audio;
    setPreviewing(true);
    audio.play().catch(() => setPreviewing(false));
    const clipDuration = effectiveEnd - startMs;
    previewTimerRef.current = setTimeout(() => {
      stopPreview();
    }, clipDuration + 200);
  };

  const stopPreview = () => {
    if (previewRef.current) {
      previewRef.current.pause();
      previewRef.current = null;
    }
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    setPreviewing(false);
  };

  useEffect(() => () => stopPreview(), []);

  if (loadState === "idle" || loadState === "loading") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {loadState === "loading" ? "Loading audio…" : ""}
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <p className="text-xs text-destructive py-1">Could not load audio — check the URL is a direct audio file link.</p>
    );
  }

  const startPct = duration > 0 ? (startMs / duration) * 100 : 0;
  const endPct = duration > 0 ? (effectiveEnd / duration) * 100 : 100;
  const clipDuration = effectiveEnd - startMs;

  return (
    <div className="space-y-3">
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
          {/* Full track */}
          <div className="absolute inset-0 rounded-lg bg-muted border border-border" />

          {/* Selected region */}
          <div
            className="absolute top-0 bottom-0 bg-primary/20 border-y border-primary/40"
            style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
          />

          {/* Tick marks every 10% */}
          {Array.from({ length: 9 }, (_, i) => (
            <div
              key={i}
              className="absolute top-1 bottom-1 w-px bg-border/50"
              style={{ left: `${(i + 1) * 10}%` }}
            />
          ))}

          {/* Start handle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-6 rounded bg-primary border-2 border-primary-foreground shadow-md cursor-ew-resize z-10 flex items-center justify-center"
            style={{ left: `${startPct}%` }}
            onPointerDown={e => onPointerDown(e, "start")}
            onPointerMove={onTrackPointerMove}
            onPointerUp={onTrackPointerUp}
          >
            <div className="w-0.5 h-3 bg-primary-foreground/60 rounded-full" />
          </div>

          {/* End handle */}
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

        {/* Time labels under handles */}
        <div className="relative h-4">
          <span
            className="absolute text-xs text-primary font-mono -translate-x-1/2"
            style={{ left: `${startPct}%` }}
          >
            {fmt(startMs)}
          </span>
          <span
            className="absolute text-xs text-primary font-mono -translate-x-1/2"
            style={{ left: `${endPct}%` }}
          >
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
        <div className="ml-auto">
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
    </div>
  );
}
