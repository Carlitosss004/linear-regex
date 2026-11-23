import { inRanges } from "./ast.js";
import { Nfa } from "./nfa.js";

export interface DState {
  id: number;
  /** Sorted NFA state ids (set / eol / match states only after closure). */
  nfa: number[];
  /** A match ends here regardless of position. */
  accept: boolean;
  /** A match ends here if we are at the end of input (via `$`). */
  acceptAtEnd: boolean;
  dead: boolean;
  fast: (DState | undefined)[]; // transitions for code units < 256
  slow: Map<number, DState>;
}

/** Lazily-built DFA: subset construction happens on demand and is memoised. */
export class LazyDfa {
  private byKey = new Map<string, DState>();
  private all: DState[] = [];
  private starts: [DState | undefined, DState | undefined] = [undefined, undefined];

  constructor(private readonly nfa: Nfa) {}

  get stateCount(): number { return this.all.length; }

  /** Start state; `atBeginning` decides whether `^` can be crossed. */
  start(atBeginning: boolean): DState {
    const idx = atBeginning ? 1 : 0;
    return (this.starts[idx] ??= this.intern(this.closure([this.nfa.start], atBeginning)));
  }

  step(s: DState, c: number): DState {
    if (c < 256) {
      const hit = s.fast[c];
      if (hit) return hit;
    } else {
      const hit = s.slow.get(c);
      if (hit) return hit;
    }
    const targets: number[] = [];
    for (const id of s.nfa) {
      const st = this.nfa.states[id];
      if (st.k === "set" && inRanges(st.ranges, c)) targets.push(st.next);
    }
    const next = this.intern(this.closure(targets, false));
    if (c < 256) s.fast[c] = next;
    else s.slow.set(c, next);
    return next;
  }

  /** Epsilon closure; `eol` states are kept in the set so end-of-input can resolve them. */
  private closure(seeds: number[], atBeginning: boolean): number[] {
    const seen = new Set<number>();
    const visited = new Set<number>();
    const stack = [...seeds];
    while (stack.length) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const st = this.nfa.states[id];
      if (st.k === "split") {
        stack.push(st.a, st.b);
        continue;
      }
      if (st.k === "bol") {
        if (atBeginning) stack.push(st.next);
        continue;
      }
      seen.add(id);
    }
    return [...seen].sort((a, b) => a - b);
  }

  private intern(set: number[]): DState {
    const key = set.join(",");
    let s = this.byKey.get(key);
    if (s) return s;
    const accept = set.some((id) => this.nfa.states[id].k === "match");
    s = {
      id: this.all.length,
      nfa: set,
      accept,
      acceptAtEnd: accept || this.reachesMatchViaEol(set),
      dead: set.length === 0,
      fast: new Array(256),
      slow: new Map(),
    };
    this.byKey.set(key, s);
    this.all.push(s);
    return s;
  }

  private reachesMatchViaEol(set: number[]): boolean {
    const seen = new Set<number>();
    const stack = set.filter((id) => this.nfa.states[id].k === "eol");
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const st = this.nfa.states[id];
      if (st.k === "eol") stack.push(st.next);
      else if (st.k === "split") stack.push(st.a, st.b);
      else if (st.k === "match") return true;
      // bol after eol only matches on empty input at position 0; ignored (rare)
    }
    return false;
  }
}
