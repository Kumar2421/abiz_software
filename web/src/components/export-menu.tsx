"use client";

import * as React from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  exportTable,
  type ExportFormat,
  type ExportSpec,
} from "@/lib/export-table";

/**
 * "Download" button offering Excel or PDF for whatever table the page holds.
 *
 * The spec is a function so the file reflects the rows on screen at the moment
 * of the click — including a search filter — rather than what they were when
 * the button rendered.
 */
export function ExportMenu<T>({
  spec,
  label = "Download",
}: {
  spec: () => ExportSpec<T>;
  label?: string;
}) {
  const [busy, setBusy] = React.useState(false);

  const run = async (format: ExportFormat) => {
    const built = spec();
    if (built.rows.length === 0) {
      toast.info("There is nothing to download yet");
      return;
    }

    setBusy(true);
    try {
      const fileName = await exportTable(format, built);
      toast.success(
        `Downloaded ${built.rows.length} ${built.rows.length === 1 ? "record" : "records"} — ${fileName}`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Could not create the file: ${error.message}`
          : "Could not create the file",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={busy}>
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {busy ? "Preparing…" : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void run("xlsx")}>
          <FileSpreadsheet className="size-4" />
          Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void run("pdf")}>
          <FileText className="size-4" />
          PDF (.pdf)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
