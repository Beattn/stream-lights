import { useRef, useState } from "react";
import { Upload, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onUploaded: (publicUrl: string) => void;
}

export default function AudioUploadButton({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const upload = async (file: File) => {
    setState("uploading");
    setErrorMsg("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/audio/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");

      setState("done");
      onUploaded(data.url as string);
      setTimeout(() => setState("idle"), 2500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
      setState("error");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = "";
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleChange}
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs h-8 shrink-0"
        disabled={state === "uploading"}
        onClick={() => inputRef.current?.click()}
      >
        {state === "uploading" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {state === "done" && <CheckCircle className="w-3.5 h-3.5 text-green-500" />}
        {state === "error" && <AlertCircle className="w-3.5 h-3.5 text-destructive" />}
        {state === "idle" && <Upload className="w-3.5 h-3.5" />}
        {state === "uploading" ? "Uploading…" : state === "done" ? "Uploaded!" : "Upload file"}
      </Button>

      {state === "error" && (
        <p className="text-xs text-destructive mt-1">{errorMsg}</p>
      )}
    </>
  );
}
