import { useRef, useState } from "react";
import { Upload, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

interface Props {
  onUploaded: (publicUrl: string) => void;
}

const BUCKET = "audio-files";

export default function AudioUploadButton({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const upload = async (file: File) => {
    if (!supabase) {
      setErrorMsg("Supabase not configured — use a URL instead.");
      setState("error");
      return;
    }

    setState("uploading");
    setErrorMsg("");

    const ext = file.name.split(".").pop() ?? "mp3";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    // Try to create the bucket (no-op if it already exists)
    await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, file, { cacheControl: "3600", upsert: false });

    if (uploadError) {
      setErrorMsg(uploadError.message);
      setState("error");
      return;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
    if (!data?.publicUrl) {
      setErrorMsg("Uploaded but couldn't get a public URL.");
      setState("error");
      return;
    }

    setState("done");
    onUploaded(data.publicUrl);
    setTimeout(() => setState("idle"), 2500);
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
