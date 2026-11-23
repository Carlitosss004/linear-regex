import { Node, inRanges } from "./ast.js";

export class StepLimitExceeded extends Error {
  constructor(public readonly steps: number) {
    super(`backtracking step limit exceeded (${steps})`);
  }
}

/**
 * Classic backtracking matcher (what Perl/PCRE/JS-style engines do). Included as a
 * baseline: its running time is exponential on patterns like (a+)+b.
 * Returns whether the *whole* input matches, and counts steps taken.
 */
export function backtrackFullMatch(
  ast: Node,
  input: string,
  stepLimit = 50_000_000,
): { matched: boolean; steps: number } {
  let steps = 0;
  type K = (pos: number) => boolean;

  function m(n: Node, pos: number, k: K): boolean {
    if (++steps > stepLimit) throw new StepLimitExceeded(steps);
    switch (n.t) {
      case "empty": return k(pos);
      case "set":
        return pos < input.length && inRanges(n.ranges, input.charCodeAt(pos)) && k(pos + 1);
      case "bol": return pos === 0 && k(pos);
      case "eol": return pos === input.length && k(pos);
      case "cat": {
        const go = (j: number, p: number): boolean =>
          j === n.items.length ? k(p) : m(n.items[j], p, (q) => go(j + 1, q));
        return go(0, pos);
      }
      case "alt": return n.items.some((it) => m(it, pos, k));
      case "quest": return m(n.child, pos, k) || k(pos);
      case "star": {
        const loop = (p: number): boolean =>
          m(n.child, p, (q) => q !== p && loop(q)) || k(p);
        return loop(pos);
      }
      case "plus": return m({ t: "cat", items: [n.child, { t: "star", child: n.child }] }, pos, k);
      case "repeat": {
        const items: Node[] = Array.from({ length: n.min }, () => n.child);
        if (n.max === Infinity) items.push({ t: "star", child: n.child });
        else for (let j = n.min; j < n.max; j++) items.push({ t: "quest", child: n.child });
        return m({ t: "cat", items }, pos, k);
      }
    }
  }
  const matched = m(ast, 0, (p) => p === input.length);
  return { matched, steps };
}
