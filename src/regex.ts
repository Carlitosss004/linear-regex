import { Node } from "./ast.js";
import { parse } from "./parser.js";
import { compile, Nfa } from "./nfa.js";
import { LazyDfa } from "./dfa.js";

export interface Match {
  index: number;
  end: number;
  text: string;
}

/**
 * Linear-time regex engine. Semantics are leftmost-longest (POSIX), not
 * leftmost-first (Perl), and there are no capture groups or backreferences.
 */
export class Regex {
  readonly ast: Node;
  private readonly nfa: Nfa;
  private readonly dfa: LazyDfa;

  constructor(readonly source: string) {
    this.ast = parse(source);
    this.nfa = compile(this.ast);
    this.dfa = new LazyDfa(this.nfa);
  }

  get nfaSize(): number { return this.nfa.states.length; }
  get dfaSize(): number { return this.dfa.stateCount; }

  /** True if the entire input matches. */
  test(input: string): boolean {
    let s = this.dfa.start(true);
    for (let i = 0; i < input.length; i++) {
      s = this.dfa.step(s, input.charCodeAt(i));
      if (s.dead) return false;
    }
    return s.acceptAtEnd;
  }

  /** Longest match starting exactly at `from`, or -1. */
  private longestAt(input: string, from: number): number {
    let s = this.dfa.start(from === 0);
    let last = s.accept || (from === input.length && s.acceptAtEnd) ? from : -1;
    for (let i = from; i < input.length; ) {
      s = this.dfa.step(s, input.charCodeAt(i++));
      if (s.dead) break;
      if (s.accept || (i === input.length && s.acceptAtEnd)) last = i;
    }
    return last;
  }

  /** Leftmost-longest match at or after `from`. */
  find(input: string, from = 0): Match | null {
    for (let i = from; i <= input.length; i++) {
      const end = this.longestAt(input, i);
      if (end >= 0) return { index: i, end, text: input.slice(i, end) };
    }
    return null;
  }

  /** All non-overlapping matches, left to right. */
  findAll(input: string): Match[] {
    const out: Match[] = [];
    let pos = 0;
    while (pos <= input.length) {
      const m = this.find(input, pos);
      if (!m) break;
      out.push(m);
      pos = m.end > m.index ? m.end : m.end + 1;
    }
    return out;
  }
}
