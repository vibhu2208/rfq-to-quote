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

export async function printQuotePdf(quoteId: string) {
  const blob = await fetchQuotePdfBlob(quoteId);
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
