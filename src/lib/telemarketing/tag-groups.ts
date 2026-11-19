/** Known education board tags (stored lowercase in filters; display as in data). */
const BOARD_TAG_KEYS = new Set([
  "cbse",
  "icse",
  "up board",
  "up_board",
  "state board",
  "state_board",
  "ib",
  "igcse",
  "cisce",
]);

export function isTelemarketingBoardTag(tag: string): boolean {
  const t = tag.trim().toLowerCase();
  if (!t) return false;
  if (BOARD_TAG_KEYS.has(t)) return true;
  if (t.endsWith(" board")) return true;
  return false;
}

export type TagOption = { tag: string; count: number };

export function partitionTelemarketingTags(options: TagOption[]) {
  const district: TagOption[] = [];
  const board: TagOption[] = [];
  for (const opt of options) {
    if (isTelemarketingBoardTag(opt.tag)) board.push(opt);
    else district.push(opt);
  }
  return { district, board };
}