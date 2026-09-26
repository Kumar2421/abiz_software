/**
 * Downloads a table as an Excel sheet or a PDF.
 *
 * Both libraries are imported on demand, inside the function that needs them,
 * so nobody downloads a PDF engine by opening the Contacts page. It runs in the
 * browser on data the page already holds: nothing is sent anywhere, and the
 * server needs no new endpoint or dependency.
 */

export type ExportFormat = "xlsx" | "pdf";

export interface ExportColumn<T> {
  header: string;
  /** Numbers stay numeric in Excel so they can be summed and sorted. */
  value: (row: T) => string | number | null | undefined;
  /** Width in Excel characters. */
  width?: number;
  /** PDF column share; columns without one split the remaining width. */
  pdfWidth?: number;
}

export interface ExportSpec<T> {
  /** Shown at the top of the PDF and as the Excel sheet name. */
  title: string;
  /** Without extension or date; both are added. */
  fileName: string;
  columns: ExportColumn<T>[];
  rows: T[];
  /** Wide tables read better landscape. */
  landscape?: boolean;
}

const stamp = () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/* ------------------------------------------------------------------ */
/* Excel                                                               */
/* ------------------------------------------------------------------ */

async function toExcel<T>(spec: ExportSpec<T>, fileName: string) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");

  const header = spec.columns.map((column) => ({
    value: column.header,
    fontWeight: "bold" as const,
    backgroundColor: "#eeeeee",
  }));

  const body = spec.rows.map((row) =>
    spec.columns.map((column) => {
      const value = column.value(row);
      if (value === null || value === undefined || value === "") return null;
      // Every non-number is written as an explicit String cell. A contact name
      // is whatever a customer set on their WhatsApp profile, so one that
      // begins with "=" must land in the sheet as text and never be evaluated
      // as a formula when the file is opened.
      return typeof value === "number"
        ? { value, type: Number }
        : { value: String(value), type: String };
    }),
  );

  await writeXlsxFile([header, ...body], {
    // Sheet names are capped at 31 characters and cannot contain : \ / ? * [ ]
    sheet: spec.title.replace(/[:\\/?*[\]]/g, " ").slice(0, 31),
    columns: spec.columns.map((column) => ({ width: column.width ?? 22 })),
    stickyRowsCount: 1,
  }).toFile(`${fileName}.xlsx`);
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

/**
 * The PDF's built-in fonts cover Latin text only. Anything else — Tamil,
 * Malayalam, Hindi, emoji — would be written as garbled bytes rather than
 * omitted, which is worse than an honest placeholder. Each such character
 * becomes "?", and the count is reported on the page so a reader knows to use
 * the Excel export for the full text.
 */
const PDF_SAFE = /[ -~ -ÿ‘’“”–—…•€™\n]/;

function pdfText(input: string): { text: string; replaced: number } {
  let replaced = 0;
  let text = "";
  // for..of walks code points, so one emoji is one "?" and not two.
  for (const char of input.replace(/[\r\t]/g, " ")) {
    if (PDF_SAFE.test(char)) {
      text += char;
    } else {
      text += "?";
      replaced += 1;
    }
  }
  return { text, replaced };
}

async function toPdf<T>(spec: ExportSpec<T>, fileName: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  let replaced = 0;
  const clean = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return "";
    const result = pdfText(String(value));
    replaced += result.replaced;
    return result.text;
  };

  const head = [spec.columns.map((column) => clean(column.header))];
  const body = spec.rows.map((row) =>
    spec.columns.map((column) => clean(column.value(row))),
  );

  const doc = new jsPDF({
    orientation: spec.landscape ? "landscape" : "portrait",
    unit: "pt",
    format: "a4",
  });

  const margin = 36;
  const generated = new Date().toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(clean(spec.title), margin, 42);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(
    `${spec.rows.length} ${spec.rows.length === 1 ? "record" : "records"} · generated ${generated}`,
    margin,
    58,
  );

  let startY = 72;
  if (replaced > 0) {
    doc.text(
      `${replaced} character${replaced === 1 ? "" : "s"} (emoji or non-Latin scripts) could not be shown here and appear as "?". The Excel export keeps the full text.`,
      margin,
      72,
      { maxWidth: doc.internal.pageSize.getWidth() - margin * 2 },
    );
    startY = 90;
  }
  doc.setTextColor(0);

  autoTable(doc, {
    head,
    body,
    startY,
    margin: { left: margin, right: margin, bottom: 40 },
    styles: { font: "helvetica", fontSize: 9, cellPadding: 5, overflow: "linebreak" },
    headStyles: { fillColor: [60, 60, 70], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 246, 248] },
    columnStyles: Object.fromEntries(
      spec.columns.flatMap((column, index) =>
        column.pdfWidth ? [[index, { cellWidth: column.pdfWidth }]] : [],
      ),
    ),
    // Repeat the header on every page of a long list.
    showHead: "everyPage",
  });

  const pages = doc.getNumberOfPages();
  const { width, height } = doc.internal.pageSize;
  doc.setFontSize(8);
  doc.setTextColor(130);
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.text(`Page ${page} of ${pages}`, width - margin, height - 20, {
      align: "right",
    });
  }

  doc.save(`${fileName}.pdf`);
}

/* ------------------------------------------------------------------ */

/** Builds the file and hands it to the browser. Resolves to the file name. */
export async function exportTable<T>(
  format: ExportFormat,
  spec: ExportSpec<T>,
): Promise<string> {
  const fileName = `${spec.fileName}-${stamp()}`;
  if (format === "xlsx") await toExcel(spec, fileName);
  else await toPdf(spec, fileName);
  return `${fileName}.${format}`;
}
