/** Never show Apify JSON blobs or internal keys in the RFQ UI. */
export function friendlyMarketplaceSourceError(source: string, raw: string): string {
  const msg = String(raw || "").trim();
  if (!msg) return `${source} was skipped.`;

  if (/timed out after/i.test(msg)) {
    return `${source} timed out and was skipped. Try Refresh prices again.`;
  }
  if (/concurrent-runs-limit|rate limit|429/i.test(msg)) {
    return `${source} is busy right now and was skipped. Try again in a few minutes.`;
  }
  if (/APIFY_TOKEN is not configured/i.test(msg)) {
    return `${source} is not configured on this server.`;
  }
  if (/Apify error|unexpected response|"error"\s*:/i.test(msg) || /^\s*[{[]/.test(msg)) {
    return `${source} could not run and was skipped.`;
  }
  if (msg.length > 100) {
    return `${source} was skipped.`;
  }
  return `${source}: ${msg}`;
}