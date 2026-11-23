import { Node, Range } from "./ast.js";

export type NState =
  | { k: "set"; ranges: Range[]; next: number }
  | { k: "split"; a: number; b: number }
  | { k: "bol"; next: number }
  | { k: "eol"; next: number }
  | { k: "match" };

export interface Nfa {
  states: NState[];
  start: number;
}

/** Expands counted repetition into plain operators. */
function expand(n: Node): Node {
  switch (n.t) {
    case "cat":
    case "alt":
      return { t: n.t, items: n.items.map(expand) };
    case "star":
    case "plus":
    case "quest":
      return { t: n.t, child: expand(n.child) };
    case "repeat": {
      const child = expand(n.child);
      const items: Node[] = [];
      for (let k = 0; k < n.min; k++) items.push(child);
      if (n.max === Infinity) items.push({ t: "star", child });
      else {
        // x{m,n} => x^m (x (x (...)?)?)?  — nested so it stays linear in size
        let tail: Node | null = null;
        for (let k = n.min; k < n.max; k++)
          tail = { t: "quest", child: tail ? { t: "cat", items: [child, tail] } : child };
        if (tail) items.push(tail);
      }
      return items.length === 0 ? { t: "empty" } : { t: "cat", items };
    }
    default:
      return n;
  }
}

/** Thompson construction, built right-to-left so each fragment knows its continuation. */
export function compile(ast: Node): Nfa {
  const states: NState[] = [];
  const add = (s: NState) => (states.push(s), states.length - 1);
  const match = add({ k: "match" });

  function build(n: Node, next: number): number {
    switch (n.t) {
      case "empty": return next;
      case "set": return add({ k: "set", ranges: n.ranges, next });
      case "bol": return add({ k: "bol", next });
      case "eol": return add({ k: "eol", next });
      case "cat": {
        let cur = next;
        for (let j = n.items.length - 1; j >= 0; j--) cur = build(n.items[j], cur);
        return cur;
      }
      case "alt": {
        const starts = n.items.map((it) => build(it, next));
        return starts.reduceRight((acc, s) => add({ k: "split", a: s, b: acc }));
      }
      case "star": {
        const split = add({ k: "split", a: -1, b: next });
        (states[split] as { a: number }).a = build(n.child, split);
        return split;
      }
      case "plus": {
        const split = add({ k: "split", a: -1, b: next });
        const body = build(n.child, split);
        (states[split] as { a: number }).a = body;
        return body;
      }
      case "quest":
        return add({ k: "split", a: build(n.child, next), b: next });
      default:
        throw new Error("unexpanded node " + n.t);
    }
  }
  const start = build(expand(ast), match);
  return { states, start };
}
