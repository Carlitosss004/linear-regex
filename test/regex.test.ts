import { test } from "node:test";
import assert from "node:assert/strict";
import { Regex, RegexSyntaxError, backtrackFullMatch, parse, StepLimitExceeded } from "../src/index.js";

test("literals, alternation, grouping", () => {
  const r = new Regex("ab|(c|d)e");
  for (const s of ["ab", "ce", "de"]) assert.ok(r.test(s), s);
  for (const s of ["", "a", "abe", "cd"]) assert.ok(!r.test(s), s);
});

test("quantifiers", () => {
  assert.ok(new Regex("a*").test(""));
  assert.ok(!new Regex("a+").test(""));
  assert.ok(new Regex("colou?r").test("color"));
  assert.ok(new Regex("a{2,3}").test("aaa"));
  assert.ok(!new Regex("a{2,3}").test("aaaa"));
  assert.ok(new Regex("a{2,}").test("aaaaaa"));
  assert.ok(new Regex("(ab){3}").test("ababab"));
  assert.ok(!new Regex("(ab){3}").test("abab"));
});

test("classes and escapes", () => {
  const r = new Regex("[a-c0-9_]+");
  assert.ok(r.test("ab_09c"));
  assert.ok(!r.test("abd"));
  assert.ok(new Regex("[^a-c]").test("d"));
  assert.ok(!new Regex("[^a-c]").test("b"));
  assert.ok(new Regex("\\d+\\.\\d+").test("3.14"));
  assert.ok(new Regex("\\w+@\\w+\\.com").test("me@host.com"));
  assert.ok(new Regex("[\\]\\-]+").test("]-]"));
  assert.ok(new Regex(".").test("x") && !new Regex(".").test("\n"));
});

test("find returns leftmost-longest", () => {
  const r = new Regex("a|ab|abc");
  assert.deepEqual(r.find("xxabcx"), { index: 2, end: 5, text: "abc" });
  assert.equal(new Regex("z").find("abc"), null);
  assert.deepEqual(new Regex("\\d+").findAll("a1 22 333").map((m) => m.text), ["1", "22", "333"]);
});

test("empty matches advance", () => {
  assert.equal(new Regex("x*").findAll("abc").length, 4);
});

test("anchors", () => {
  assert.deepEqual(new Regex("^ab").find("abab"), { index: 0, end: 2, text: "ab" });
  assert.equal(new Regex("^ab").find("cab"), null);
  assert.equal(new Regex("ab$").find("abab")?.index, 2);
  assert.equal(new Regex("ab$").find("aba"), null);
  assert.ok(new Regex("^$").test(""));
  assert.equal(new Regex("(a|b$)+").find("aab")?.text, "aab");
});

test("syntax errors", () => {
  for (const bad of ["(", ")", "*a", "[abc", "a{3,1}", "a\\", "\\q", "[z-a]", "a{2000}"])
    assert.throws(() => new Regex(bad), RegexSyntaxError, bad);
});

test("pathological pattern is linear", () => {
  const r = new Regex("(a+)+b");
  const input = "a".repeat(100_000);
  assert.equal(r.test(input), false);
  assert.ok(r.dfaSize < 10);
});

test("backtracker blows up where the DFA does not", () => {
  const ast = parse("(a+)+b");
  assert.throws(() => backtrackFullMatch(ast, "a".repeat(30), 1_000_000), StepLimitExceeded);
  assert.equal(backtrackFullMatch(ast, "aaab").matched, true);
});

test("differential fuzz against JS RegExp (full match)", () => {
  let seed = 12345;
  const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
  const gen = (d: number): string => {
    const c = rnd(d <= 0 ? 2 : 9);
    switch (c) {
      case 0: case 1: return "abc"[rnd(3)];
      case 2: return gen(d - 1) + gen(d - 1);
      case 3: return `(?:${gen(d - 1)}|${gen(d - 1)})`;
      case 4: return `(?:${gen(d - 1)})*`;
      case 5: return `(?:${gen(d - 1)})+`;
      case 6: return `(?:${gen(d - 1)})?`;
      case 7: return `(?:${gen(d - 1)}){${rnd(3)},${2 + rnd(2)}}`;
      default: return "[ab]";
    }
  };
  for (let n = 0; n < 400; n++) {
    const src = gen(3);
    const ours = new Regex(src);
    const js = new RegExp(`^(?:${src})$`);
    const bt = parse(src);
    for (let k = 0; k < 25; k++) {
      const s = Array.from({ length: rnd(7) }, () => "abc"[rnd(3)]).join("");
      const want = js.test(s);
      assert.equal(ours.test(s), want, `dfa /${src}/ on "${s}"`);
      assert.equal(backtrackFullMatch(bt, s).matched, want, `bt /${src}/ on "${s}"`);
    }
  }
});
