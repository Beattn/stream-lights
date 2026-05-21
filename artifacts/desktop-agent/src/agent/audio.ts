import { exec, type ChildProcess } from "child_process";

interface PlayOptions {
  url: string;
  volume?: number;
  startMs?: number;
  endMs?: number;
}

// Track all active child processes so we can kill them on app quit
const activeProcesses = new Set<ChildProcess>();

// Called by main process on before-quit to ensure no orphan processes linger
export function killAllAudioProcesses(): void {
  for (const proc of activeProcesses) {
    try { proc.kill("SIGKILL"); } catch { /* already dead */ }
  }
  activeProcesses.clear();
}

class AudioPlayer {
  async play(opts: PlayOptions): Promise<void> {
    const volume = Math.max(0, Math.min(100, opts.volume ?? 100));
    const startSec = (opts.startMs ?? 0) / 1000;
    const hasClip = opts.endMs != null && opts.endMs > (opts.startMs ?? 0);
    const clipDurationSec = hasClip ? (opts.endMs! - (opts.startMs ?? 0)) / 1000 : null;

    if (process.platform === "win32") {
      const playDuration = clipDurationSec != null ? clipDurationSec : 30;
      const script = `
        $vol = ${volume} / 100.0;
        $media = New-Object System.Windows.Media.MediaPlayer;
        $media.Volume = $vol;
        $media.Open([uri]"${opts.url}");
        Start-Sleep -Milliseconds 500;
        $media.Position = [TimeSpan]::FromSeconds(${startSec});
        $media.Play();
        Start-Sleep -Seconds ${playDuration};
        $media.Stop();
        $media.Close();
      `.trim().replace(/\n\s+/g, " ");

      await new Promise<void>((resolve) => {
        const proc = exec(
          `powershell -NoProfile -NonInteractive -Command "${script}"`,
          { timeout: Math.ceil(playDuration + 5) * 1000 },
          () => {
            activeProcesses.delete(proc);
            resolve();
          }
        );
        activeProcesses.add(proc);
      });
    }
  }
}

export const audioPlayer = new AudioPlayer();
