export async function fetchQuotePdfBlob(quoteId: string): Promise<Blob> {
  const res = await fetch(`/api/quotes/${quoteId}/pdf`);
  if (!res.ok) {
    throw new Error("PDF generation failed");
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
