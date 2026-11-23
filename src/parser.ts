import { Node, Range, negate, normalize } from "./ast.js";

export class RegexSyntaxError extends Error {
  constructor(message: string, public readonly pos: number) {
    super(`${message} at position ${pos}`);
    this.name = "RegexSyntaxError";
  }
}

const DIGIT: Range[] = [[48, 57]];
const WORD: Range[] = [[48, 57], [65, 90], [95, 95], [97, 122]];
const SPACE: Range[] = [[9, 13], [32, 32]];
const MAX_REPEAT = 1000;

const set = (ranges: Range[]): Node => ({ t: "set", ranges: normalize(ranges) });

/** Recursive-descent parser for a POSIX-flavoured regex dialect (no backrefs, no lazy quantifiers). */
export function parse(src: string): Node {
  let i = 0;
  const peek = () => src[i];
  const eof = () => i >= src.length;

  function parseAlt(): Node {
    const items = [parseCat()];
    while (peek() === "|") {
      i++;
      items.push(parseCat());
    }
    return items.length === 1 ? items[0] : { t: "alt", items };
  }

  function parseCat(): Node {
    const items: Node[] = [];
    while (!eof() && peek() !== "|" && peek() !== ")") items.push(parseRepeat());
    if (items.length === 0) return { t: "empty" };
    return items.length === 1 ? items[0] : { t: "cat", items };
  }

  function parseRepeat(): Node {
    let node = parseAtom();
    for (;;) {
      const c = peek();
      if (c === "*") node = { t: "star", child: node };
      else if (c === "+") node = { t: "plus", child: node };
      else if (c === "?") node = { t: "quest", child: node };
      else if (c === "{") {
        const m = /^\{(\d+)(,(\d*))?\}/.exec(src.slice(i));
        if (!m) throw new RegexSyntaxError("Invalid counted repetition", i);
        const min = Number(m[1]);
        const max = m[2] === undefined ? min : m[3] === "" ? Infinity : Number(m[3]);
        if (max < min) throw new RegexSyntaxError("Repetition max below min", i);
        if (min > MAX_REPEAT || (max !== Infinity && max > MAX_REPEAT))
          throw new RegexSyntaxError(`Repetition count above ${MAX_REPEAT}`, i);
        node = { t: "repeat", child: node, min, max };
        i += m[0].length;
        continue;
      } else break;
      i++;
    }
    return node;
  }

  function parseAtom(): Node {
    const c = src[i];
    if (c === "(") {
      i++;
      if (src.startsWith("?:", i)) i += 2;
      const inner = parseAlt();
      if (peek() !== ")") throw new RegexSyntaxError("Unclosed group", i);
      i++;
      return inner;
    }
    if (c === "[") return parseClass();
    if (c === ".") {
      i++;
      return set(negate([[10, 10]]));
    }
    if (c === "^") { i++; return { t: "bol" }; }
    if (c === "$") { i++; return { t: "eol" }; }
    if (c === "\\") return parseEscape(false) as Node;
    if (c === "*" || c === "+" || c === "?") throw new RegexSyntaxError("Nothing to repeat", i);
    if (c === "{") throw new RegexSyntaxError("Nothing to repeat", i);
    i++;
    return set([[c.charCodeAt(0), c.charCodeAt(0)]]);
  }

  /** Parses an escape; inside a class returns ranges, outside a Node. */
  function parseEscape(inClass: boolean): Node | Range[] {
    const start = i;
    i++; // backslash
    if (eof()) throw new RegexSyntaxError("Trailing backslash", start);
    const c = src[i++];
    let ranges: Range[];
    switch (c) {
      case "d": ranges = DIGIT; break;
      case "D": ranges = negate(DIGIT); break;
      case "w": ranges = WORD; break;
      case "W": ranges = negate(WORD); break;
      case "s": ranges = SPACE; break;
      case "S": ranges = negate(SPACE); break;
      case "n": ranges = [[10, 10]]; break;
      case "t": ranges = [[9, 9]]; break;
      case "r": ranges = [[13, 13]]; break;
      default:
        if (/[a-zA-Z0-9]/.test(c)) throw new RegexSyntaxError(`Unsupported escape \\${c}`, start);
        ranges = [[c.charCodeAt(0), c.charCodeAt(0)]];
    }
    return inClass ? ranges : set(ranges);
  }

  function parseClass(): Node {
    const start = i;
    i++; // [
    let negated = false;
    if (peek() === "^") { negated = true; i++; }
    const ranges: Range[] = [];
    let first = true;
    while (!eof() && (peek() !== "]" || first)) {
      first = false;
      let lo: number;
      if (peek() === "\\") {
        const r = parseEscape(true) as Range[];
        if (r.length !== 1 || r[0][0] !== r[0][1]) { ranges.push(...r); continue; }
        lo = r[0][0];
      } else lo = src.charCodeAt(i++);
      if (peek() === "-" && src[i + 1] !== "]" && i + 1 < src.length) {
        i++;
        let hi: number;
        if (peek() === "\\") {
          const r = parseEscape(true) as Range[];
          if (r.length !== 1 || r[0][0] !== r[0][1]) throw new RegexSyntaxError("Invalid range end", i);
          hi = r[0][0];
        } else hi = src.charCodeAt(i++);
        if (hi < lo) throw new RegexSyntaxError("Reversed class range", i);
        ranges.push([lo, hi]);
      } else ranges.push([lo, lo]);
    }
    if (eof()) throw new RegexSyntaxError("Unclosed character class", start);
    i++; // ]
    const norm = normalize(ranges);
    return { t: "set", ranges: negated ? negate(norm) : norm };
  }

  const ast = parseAlt();
  if (!eof()) throw new RegexSyntaxError("Unmatched ')'", i);
  return ast;
}
