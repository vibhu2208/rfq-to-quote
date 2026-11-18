import { shouldAutoBindCatalogMatch } from "@/lib/product-match";
import type { RfqRequirementItem } from "@/lib/rfq-items";

/** Structural match used by the workspace. Page and catalog types both satisfy it. */
type WorkspaceMatch = {
  score: number;
  product: {
    id: string;
    name: string;
    description?: string;
  };
};

function bindable(match: WorkspaceMatch) {
  return {
    score: match.score,
    product: {
      id: match.product.id,
      code: match.product.id,
      name: match.product.name,
      description: match.product.description || "",
      unit: "pcs",
      offerPrice: 0,
      lastPrice: null,
      taxRate: 18,
    },
  };
}

/** Bulk-accept only matches at least this strong, and only when specs agree. */
export const HIGH_CONFIDENCE_MATCH_SCORE = 45;

export const MATCH_SCORE_TITLE =
  "Catalog match score: weighted overlap of brand, type, and specs. Higher is a closer match. This is not the AI parse confidence in the header. Scores can pass 100 when several signals overlap.";

export function requirementMatchText(item: {
  brand?: string | null;
  description?: string | null;
  model?: string | null;
  code?: string | null;
}): string {
  return [item.brand, item.description, item.model, item.code].filter(Boolean).join(" ");
}

export function isHighConfidenceCatalogMatch(
  match: WorkspaceMatch | null | undefined,
  requirementText: string
): boolean {
  if (!match || match.score < HIGH_CONFIDENCE_MATCH_SCORE) return false;
  return shouldAutoBindCatalogMatch(bindable(match), requirementText);
}

export function sortMatchesByScore<T extends WorkspaceMatch>(matches: T[]): T[] {
  return [...matches].sort(
    (a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name)
  );
}

/** Top suggestions in score order, plus the selected product if it would otherwise be hidden. */
export function visibleSuggestions<T extends WorkspaceMatch>(
  matches: T[],
  selectedId: string | undefined,
  limit = 4
): T[] {
  const top = matches.slice(0, limit);
  if (!selectedId || top.some((match) => match.product.id === selectedId)) return top;
  const selected = matches.find((match) => match.product.id === selectedId);
  return selected ? [...top, selected] : top;
}

type LineMatches<T extends WorkspaceMatch = WorkspaceMatch> = {
  lineNumber: number;
  requirementText: string;
  matches: T[];
};

/**
 * After suggestions settle, drop a selection the user can no longer see.
 * A choice the user made is pinned back into the list. An automatic pick
 * that disappeared is replaced by the new top compatible match, or cleared.
 */
export function reconcileSettledLineSelection<T extends WorkspaceMatch>(input: {
  previousSelection: Record<number, string>;
  previousItems: Array<{ lineNumber: number; matches: T[] }>;
  nextItems: Array<LineMatches<T>>;
  extraIdsByLine: Record<number, string[]>;
  touchedLines: number[];
}): {
  lineSelection: Record<number, string>;
  pinFromPrevious: Array<{ lineNumber: number; match: T }>;
} {
  const touched = new Set(input.touchedLines);
  const previousByLine = new Map(input.previousItems.map((item) => [item.lineNumber, item]));
  const lineSelection: Record<number, string> = {};
  const pinFromPrevious: Array<{ lineNumber: number; match: T }> = [];

  for (const item of input.nextItems) {
    const selected = input.previousSelection[item.lineNumber];
    const extraIds = new Set(input.extraIdsByLine[item.lineNumber] || []);
    const visible = new Set([
      ...item.matches.map((match) => match.product.id),
      ...extraIds,
    ]);

    if (selected && visible.has(selected)) {
      lineSelection[item.lineNumber] = selected;
      continue;
    }

    if (selected && touched.has(item.lineNumber)) {
      const previous = previousByLine
        .get(item.lineNumber)
        ?.matches.find((match) => match.product.id === selected);
      if (previous) {
        pinFromPrevious.push({ lineNumber: item.lineNumber, match: previous });
        lineSelection[item.lineNumber] = selected;
        continue;
      }
    }

    if (!touched.has(item.lineNumber)) {
      const top = sortMatchesByScore(item.matches)[0];
      if (top && shouldAutoBindCatalogMatch(bindable(top), item.requirementText)) {
        lineSelection[item.lineNumber] = top.product.id;
      }
    }
  }

  return { lineSelection, pinFromPrevious };
}

/**
 * Restore saved selections that are still on screen. A saved id that is not
 * in the settled suggestions is not kept as a hidden quote binding.
 */
export function restoreVisibleLineSelection<T extends WorkspaceMatch>(input: {
  saved: Record<number, string> | null;
  items: Array<LineMatches<T>>;
  extraIdsByLine: Record<number, string[]>;
  /** When nothing was saved, auto-pick a compatible top match. */
  autoWhenEmpty: boolean;
}): Record<number, string> {
  const lineSelection: Record<number, string> = {};
  const saved = input.saved || {};
  const dropped: number[] = [];

  for (const item of input.items) {
    const selected = saved[item.lineNumber];
    const extraIds = new Set(input.extraIdsByLine[item.lineNumber] || []);
    const visible =
      !selected ||
      extraIds.has(selected) ||
      item.matches.some((match) => match.product.id === selected);
    if (selected && visible) {
      lineSelection[item.lineNumber] = selected;
    } else if (selected) {
      dropped.push(item.lineNumber);
    }
  }

  const fill = input.autoWhenEmpty || dropped.length > 0;
  if (!fill) return lineSelection;

  for (const item of input.items) {
    if (lineSelection[item.lineNumber]) continue;
    if (!input.autoWhenEmpty && !dropped.includes(item.lineNumber)) continue;
    const top = sortMatchesByScore(item.matches)[0];
    if (top && shouldAutoBindCatalogMatch(bindable(top), item.requirementText)) {
      lineSelection[item.lineNumber] = top.product.id;
    }
  }

  return lineSelection;
}

export function acceptHighConfidenceSelections<T extends WorkspaceMatch>(
  items: Array<LineMatches<T>>,
  current: Record<number, string>
): { next: Record<number, string>; acceptedLines: number[] } {
  const next = { ...current };
  const acceptedLines: number[] = [];

  for (const item of items) {
    const currentId = next[item.lineNumber];
    const visible = item.matches.some((match) => match.product.id === currentId);
    if (currentId && visible) continue;

    const best = sortMatchesByScore(item.matches).find((match) =>
      isHighConfidenceCatalogMatch(match, item.requirementText)
    );
    if (!best) continue;
    next[item.lineNumber] = best.product.id;
    acceptedLines.push(item.lineNumber);
  }

  return { next, acceptedLines };
}

export function mergeAddedRequirementLines<T extends { lineNumber: number; matches: WorkspaceMatch[] }>(
  items: T[],
  requirements: RfqRequirementItem[],
  added: RfqRequirementItem[]
): { items: T[]; requirements: RfqRequirementItem[] } {
  const nextItems = [...items];
  const nextReqs = [...requirements];
  const itemIds = new Set(nextItems.map((item) => item.lineNumber));
  const reqIds = new Set(nextReqs.map((item) => item.lineNumber));

  for (const line of added) {
    if (!reqIds.has(line.lineNumber)) {
      nextReqs.push(line);
      reqIds.add(line.lineNumber);
    }
    if (!itemIds.has(line.lineNumber)) {
      nextItems.push({
        lineNumber: line.lineNumber,
        requirement: line,
        keywords: [],
        matches: [],
      } as unknown as T);
      itemIds.add(line.lineNumber);
    }
  }

  nextItems.sort((a, b) => a.lineNumber - b.lineNumber);
  nextReqs.sort((a, b) => a.lineNumber - b.lineNumber);
  return { items: nextItems, requirements: nextReqs };
}

const COMMERCIAL_ASK = [
  /\bgst\b|gstin|tax invoice/i,
  /deliver|dispatch|lead time|shipping/i,
  /warrant/i,
  /payment|credit period|advance/i,
];

/** Short commercial lines (GST, delivery, warranty, payment) from the source email. */
export function extractCommercialAsks(text: string): string[] {
  const asks: string[] = [];
  for (const raw of String(text || "").split(/\n+/)) {
    const line = raw.trim();
    if (line.length < 6 || line.length > 240) continue;
    if (!COMMERCIAL_ASK.some((pattern) => pattern.test(line))) continue;
    if (!asks.includes(line)) asks.push(line);
    if (asks.length >= 6) break;
  }
  return asks;
}
