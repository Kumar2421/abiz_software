"use client";

import * as React from "react";
import { FileText, SendHorizontal } from "lucide-react";

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

/**
 * Text only. Outbound attachments are deliberately not offered: they need
 * durable object storage, which is not set up. Incoming attachments still
 * render in the thread.
 */
export function Composer({
  onSend,
  disabled,
  className,
}: {
  onSend: (body: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [value, setValue] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const body = value.trim();
    if (!body || disabled) return;
    onSend(body);
    setValue("");
    textareaRef.current?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className={cn("border-t bg-card p-3", className)}>
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder={
            disabled ? "Send window closed" : "Type a message…  (Enter to send)"
          }
          className="max-h-32 min-h-10 flex-1 resize-none"
        />

        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
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
            onClick={submit}
            disabled={disabled || !value.trim()}
          >
            <SendHorizontal className="size-4" />
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
