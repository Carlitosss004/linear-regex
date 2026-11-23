/** Inclusive code-unit range [lo, hi]. */
export type Range = readonly [number, number];

export type Node =
  | { t: "empty" }
  | { t: "set"; ranges: Range[] }
  | { t: "cat"; items: Node[] }
  | { t: "alt"; items: Node[] }
  | { t: "star"; child: Node }
  | { t: "plus"; child: Node }
  | { t: "quest"; child: Node }
  | { t: "repeat"; child: Node; min: number; max: number } // max = Infinity for open
  | { t: "bol" }
  | { t: "eol" };

export const MAX_CODE = 0xffff;

export function normalize(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [lo, hi] of sorted) {
    const last = out[out.length - 1];
    if (last && lo <= last[1] + 1) last[1] = Math.max(last[1], hi);
    else out.push([lo, hi]);
  }
  return out;
}

export function negate(ranges: Range[]): Range[] {
  const out: Range[] = [];
  let next = 0;
  for (const [lo, hi] of normalize(ranges)) {
    if (lo > next) out.push([next, lo - 1]);
    next = hi + 1;
  }
  if (next <= MAX_CODE) out.push([next, MAX_CODE]);
  return out;
}

export function inRanges(ranges: readonly Range[], c: number): boolean {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const r = ranges[mid];
    if (c < r[0]) hi = mid - 1;
    else if (c > r[1]) lo = mid + 1;
    else return true;
  }
  return false;
}
