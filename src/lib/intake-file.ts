/** Copy a pasted/dropped File so the blob still exists when we upload. */
export async function stabilizeIntakeFile(file: File): Promise<File> {
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    throw new Error("Could not read that file. Paste it again or choose it from disk.");
  }
  if (bytes.byteLength <= 0) {
    throw new Error("That file is empty.");
  }
  const named = file.name && /\.[a-z0-9]+$/i.test(file.name);
  const name = named
    ? file.name
    : file.type === "application/pdf"
      ? "pasted-document.pdf"
      : "pasted-screenshot.png";
  return new File([bytes], name, {
    type: file.type || "application/octet-stream",
    lastModified: Date.now(),
  });
}
