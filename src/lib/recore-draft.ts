/** Client-side Recore draft persistence (survives modal close + browser refresh). */

export const RECORE_DRAFT_VERSION = 1 as const;
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type RecoreChannel = "EMAIL" | "WHATSAPP";

export type RecoreDraftState = {
  v: typeof RECORE_DRAFT_VERSION;
  rfqId: string;
  vendorId: string;
  channel: RecoreChannel;
  lineNumbers: number[];
  contactIds: string[];
  subject: string;
  body: string;
  draftTouched: boolean;
  updatedAt: number;
};

function storageKey(rfqId: string, vendorId: string) {
  return `qf:recore-draft:v${RECORE_DRAFT_VERSION}:${rfqId}:${vendorId}`;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeChannel(value: unknown): RecoreChannel {
  return value === "WHATSAPP" ? "WHATSAPP" : "EMAIL";
}

function normalizeDraft(
  value: unknown,
  rfqId: string,
  vendorId: string
): RecoreDraftState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const updatedAt = Number(raw.updatedAt);
  if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > DRAFT_TTL_MS) {
    return null;
  }
  if (raw.rfqId !== rfqId || raw.vendorId !== vendorId) return null;

  const lineNumbers = Array.isArray(raw.lineNumbers)
    ? [
        ...new Set(
          raw.lineNumbers
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n) && n >= 1)
            .map((n) => Math.trunc(n))
        ),
      ].sort((a, b) => a - b)
    : [];
  const contactIds = Array.isArray(raw.contactIds)
    ? [
        ...new Set(
          raw.contactIds.filter((id): id is string => typeof id === "string" && id.length > 0)
        ),
      ]
    : [];

  return {
    v: RECORE_DRAFT_VERSION,
    rfqId,
    vendorId,
    channel: normalizeChannel(raw.channel),
    lineNumbers,
    contactIds,
    subject: typeof raw.subject === "string" ? raw.subject : "",
    body: typeof raw.body === "string" ? raw.body : "",
    draftTouched: Boolean(raw.draftTouched),
    updatedAt,
  };
}

export function loadRecoreDraft(
  rfqId: string,
  vendorId: string
): RecoreDraftState | null {
  if (!canUseStorage()) return null;
  try {
    const key = storageKey(rfqId, vendorId);
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      // Migrate older sessionStorage drafts once.
      const legacy = window.sessionStorage.getItem(`recore-draft:${rfqId}:${vendorId}`);
      if (!legacy) return null;
      const migrated = normalizeDraft(
        { ...JSON.parse(legacy), rfqId, vendorId, updatedAt: Date.now() },
        rfqId,
        vendorId
      );
      if (migrated) {
        saveRecoreDraft(rfqId, vendorId, migrated);
        window.sessionStorage.removeItem(`recore-draft:${rfqId}:${vendorId}`);
      }
      return migrated;
    }
    const parsed = normalizeDraft(JSON.parse(raw), rfqId, vendorId);
    if (!parsed) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveRecoreDraft(
  rfqId: string,
  vendorId: string,
  draft: Omit<RecoreDraftState, "v" | "rfqId" | "vendorId" | "updatedAt"> & {
    updatedAt?: number;
  }
): void {
  if (!canUseStorage()) return;
  try {
    const payload: RecoreDraftState = {
      v: RECORE_DRAFT_VERSION,
      rfqId,
      vendorId,
      channel: normalizeChannel(draft.channel),
      lineNumbers: [
        ...new Set(
          draft.lineNumbers
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n) && n >= 1)
            .map((n) => Math.trunc(n))
        ),
      ].sort((a, b) => a - b),
      contactIds: [
        ...new Set(draft.contactIds.filter((id) => typeof id === "string" && id.length > 0)),
      ],
      subject: draft.subject.slice(0, 500),
      body: draft.body.slice(0, 50_000),
      draftTouched: Boolean(draft.draftTouched),
      updatedAt: draft.updatedAt ?? Date.now(),
    };
    window.localStorage.setItem(storageKey(rfqId, vendorId), JSON.stringify(payload));
  } catch {
    // Quota / private mode — closing still works.
  }
}

export function clearRecoreDraft(rfqId: string, vendorId: string): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(storageKey(rfqId, vendorId));
    window.sessionStorage.removeItem(`recore-draft:${rfqId}:${vendorId}`);
  } catch {
    // ignore
  }
}

/** Drop every Recore draft for an RFQ (e.g. after re-parse changes lines). */
export function clearRecoreDraftsForRfq(rfqId: string): void {
  if (!canUseStorage() || !rfqId) return;
  try {
    const prefix = `qf:recore-draft:v${RECORE_DRAFT_VERSION}:${rfqId}:`;
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) window.localStorage.removeItem(key);
    // Legacy sessionStorage drafts.
    const legacyPrefix = `recore-draft:${rfqId}:`;
    const legacyKeys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (key && key.startsWith(legacyPrefix)) legacyKeys.push(key);
    }
    for (const key of legacyKeys) window.sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Keep only line numbers that still exist on the RFQ after a re-parse. */
export function filterDraftLineNumbers(
  draft: RecoreDraftState | null,
  validLineNumbers: number[]
): number[] {
  if (!draft) return [];
  const valid = new Set(validLineNumbers);
  return draft.lineNumbers.filter((lineNumber) => valid.has(lineNumber));
}
