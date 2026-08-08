"use client";

import * as React from "react";
import {
  FileText,
  Mic,
  Paperclip,
  SendHorizontal,
  Square,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { messageTemplates } from "@/lib/templates";
import { cn } from "@/lib/utils";

/** WhatsApp's own caps, mirrored from the API so bad files fail before upload. */
const LIMITS: Record<string, number> = {
  image: 5 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
};

const kindOf = (mime: string) => {
  const base = mime.split(";")[0]!.toLowerCase();
  if (base.startsWith("image/")) return "image";
  if (base.startsWith("video/")) return "video";
  if (base.startsWith("audio/")) return "audio";
  return "document";
};

function AttachmentPreview({
  file,
  onClear,
}: {
  file: File;
  onClear: () => void;
}) {
  // Created during render so the thumbnail appears on the first paint; the
  // effect below is only responsible for releasing it.
  const preview = React.useMemo(
    () => (file.type.startsWith("image/") ? URL.createObjectURL(file) : null),
    [file],
  );

  React.useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <div className="mb-2 flex items-center gap-3 rounded-lg border bg-accent/50 p-2">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="size-12 rounded-md object-cover" />
      ) : (
        <div className="flex size-12 items-center justify-center rounded-md bg-background">
          <FileText className="size-5 text-muted-foreground" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{file.name}</p>
        <p className="text-xs text-muted-foreground">
          {(file.size / 1024).toFixed(0)} KB · add a caption below
        </p>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onClear}
        aria-label="Remove attachment"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

export function Composer({
  onSend,
  onSendAttachment,
  disabled,
  className,
}: {
  onSend: (body: string) => void;
  onSendAttachment: (file: File | Blob, caption?: string) => Promise<void>;
  disabled?: boolean;
  className?: string;
}) {
  const [value, setValue] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [sending, setSending] = React.useState(false);
  const [recording, setRecording] = React.useState(false);

  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  const pickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = event.target.files?.[0];
    event.target.value = ""; // allow re-picking the same file
    if (!picked) return;

    const limit = LIMITS[kindOf(picked.type)] ?? LIMITS.document!;
    if (picked.size > limit) {
      toast.error(
        `That file is too large — the limit is ${Math.floor(limit / 1024 / 1024)} MB`,
      );
      return;
    }
    setFile(picked);
    textareaRef.current?.focus();
  };

  const submit = async () => {
    if (disabled || sending) return;
    const caption = value.trim();

    if (file) {
      setSending(true);
      try {
        await onSendAttachment(file, caption || undefined);
        setFile(null);
        setValue("");
      } finally {
        setSending(false);
      }
      return;
    }

    if (!caption) return;
    onSend(caption);
    setValue("");
    textareaRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  };

  /* ---------------- voice notes ---------------- */

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };

      recorder.onstop = async () => {
        // Always release the mic, even if the upload fails.
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
        if (blob.size === 0) return;
        setSending(true);
        try {
          await onSendAttachment(blob);
        } finally {
          setSending(false);
        }
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      toast.error("Microphone access was blocked");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const canSend = Boolean(file) || value.trim().length > 0;

  return (
    <div className={cn("border-t bg-card p-3", className)}>
      {file && <AttachmentPreview file={file} onClear={() => setFile(null)} />}

      {recording && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          <span className="size-2 animate-pulse rounded-full bg-destructive" />
          Recording — press stop to send
        </div>
      )}

      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || recording}
          rows={1}
          placeholder={
            disabled
              ? "Send window closed"
              : file
                ? "Add a caption…"
                : "Type a message…  (Enter to send)"
          }
          className="max-h-32 min-h-10 flex-1 resize-none"
        />

        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={pickFile}
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled || recording}
                aria-label="Insert template"
              >
                <FileText className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Templates</DropdownMenuLabel>
              {messageTemplates.map((template) => (
                <DropdownMenuItem
                  key={template.id}
                  onSelect={() => setValue(template.body)}
                >
                  {template.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled || recording || sending}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach a file"
          >
            <Paperclip className="size-4" />
          </Button>

          <Button
            type="button"
            variant={recording ? "destructive" : "ghost"}
            size="icon"
            disabled={disabled || sending || Boolean(file)}
            onClick={recording ? stopRecording : startRecording}
            aria-label={recording ? "Stop recording" : "Record a voice note"}
          >
            {recording ? (
              <Square className="size-4" />
            ) : (
              <Mic className="size-4" />
            )}
          </Button>

          <Button
            type="button"
            onClick={submit}
            disabled={disabled || sending || recording || !canSend}
          >
            <SendHorizontal className="size-4" />
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
