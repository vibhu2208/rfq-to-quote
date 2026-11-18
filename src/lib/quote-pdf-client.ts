async function pdfErrorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown };
    if (typeof data.error === "string" && data.error.trim()) return data.error;
  } catch {
    // ignore non-JSON bodies
  }
  return "PDF generation failed";
}

export async function fetchQuotePdfBlob(quoteId: string): Promise<Blob> {
  const res = await fetch(`/api/quotes/${quoteId}/pdf`);
  if (!res.ok) {
    throw new Error(await pdfErrorMessage(res));
  }
  return res.blob();
}

export async function downloadQuotePdf(quoteId: string, filename: string) {
  const blob = await fetchQuotePdfBlob(quoteId);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export type PrintPopupHandle = {
  blocked: boolean;
  win: Window | null;
};

export const PRINT_BLOCKED_MESSAGE =
  "The browser blocked the print window. Allow pop-ups for this site, then click Print again.";

/**
 * Open the print window in the same turn as the click. Callers must invoke this
 * before any await, or Chrome's popup blocker will drop the window.
 */
export function openPrintWindow(): PrintPopupHandle {
  if (typeof window === "undefined") return { blocked: true, win: null };
  const win = window.open("about:blank", "_blank");
  if (!win) return { blocked: true, win: null };
  try {
    win.document.title = "Print quotation";
    win.document.body.replaceChildren();
    const note = win.document.createElement("p");
    note.textContent = "Preparing quotation for print…";
    note.style.fontFamily = "sans-serif";
    note.style.padding = "24px";
    win.document.body.appendChild(note);
  } catch {
    // The window is open; the PDF frame replaces this document.
  }
  return { blocked: false, win };
}

function mountPrintFrame(win: Window, url: string) {
  const doc = win.document;
  doc.open();
  doc.write(
    `<!doctype html><html><head><title>Print quotation</title><style>html,body{margin:0;height:100%;background:#fff;font-family:sans-serif}p{margin:0;padding:8px 12px;font-size:13px}iframe{border:0;width:100%;height:calc(100% - 36px)}</style></head><body><p>If the print dialog does not open, press Ctrl+P or Cmd+P.</p><iframe id="qpdf" title="Quotation"></iframe></body></html>`
  );
  doc.close();
  const frame = doc.getElementById("qpdf");
  // The iframe was created in the popup document, so the opener's
  // HTMLIFrameElement constructor does not match it.
  if (!frame || !(frame instanceof win.HTMLIFrameElement)) {
    win.location.replace(url);
    window.setTimeout(() => {
      try {
        win.focus();
        win.print();
      } catch {
        // The PDF tab stays open for a manual print.
      }
    }, 600);
    return;
  }
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch {
      try {
        win.focus();
        win.print();
      } catch {
        // The PDF stays visible in the window the user already allowed.
      }
    }
  };
  frame.src = url;
}

export async function printQuotePdf(quoteId: string, popup?: PrintPopupHandle | null) {
  const handle = popup && popup.win ? popup : openPrintWindow();
  if (!handle.win || handle.blocked) {
    throw new Error(PRINT_BLOCKED_MESSAGE);
  }
  const win = handle.win;
  try {
    const blob = await fetchQuotePdfBlob(quoteId);
    if (win.closed) {
      throw new Error("Print window was closed before the quotation was ready.");
    }
    const url = URL.createObjectURL(blob);
    mountPrintFrame(win, url);
    window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  } catch (error) {
    if (!win.closed) {
      try {
        win.close();
      } catch {
        // ignore close failures
      }
    }
    throw error;
  }
}
