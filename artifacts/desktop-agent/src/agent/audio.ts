import { exec } from "child_process";

interface PlayOptions {
  url: string;
  volume?: number;
}

class AudioPlayer {
  async play(opts: PlayOptions): Promise<void> {
    const volume = Math.max(0, Math.min(100, opts.volume ?? 100));

    if (process.platform === "win32") {
      const script = `
        $vol = ${volume} / 100.0;
        $media = New-Object System.Windows.Media.MediaPlayer;
        $media.Volume = $vol;
        $media.Open([uri]"${opts.url}");
        Start-Sleep -Milliseconds 500;
        $media.Play();
        Start-Sleep -Seconds 10;
      `.trim().replace(/\n\s+/g, " ");

      await new Promise<void>((resolve) => {
        exec(
          `powershell -NoProfile -NonInteractive -Command "${script}"`,
          { timeout: 15000 },
          () => resolve()
        );
      });
    }
  }
}

export const audioPlayer = new AudioPlayer();
