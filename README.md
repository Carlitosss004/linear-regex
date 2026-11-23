# linear-regex

A from-scratch regular expression engine in TypeScript that **never backtracks**. It parses a pattern, builds a Thompson NFA, and runs it through a lazily constructed DFA, so matching takes O(n) time whatever the pattern. A classic backtracking matcher is included as a baseline to show the difference.

Backtracking engines (Perl, PCRE, JavaScript's `RegExp`) can take exponential time on patterns like `(a+)+b`. That is the cause of ReDoS outages. This project shows the automata-theoretic alternative (Russ Cox's "Regular Expression Matching Can Be Simple And Fast").

## Install and run

```bash
npm install
npm run bench       # backtracker vs DFA
npm test            # unit tests + differential fuzzing against JS RegExp
npm run typecheck
```

```ts
import { Regex } from "./src/index.js";

const re = new Regex("\\d+ms");
re.test("12ms");                       // true (whole-input match)
re.find("GET / 200 12ms");             // { index: 12, end: 16, text: "12ms" }
re.findAll("1ms 22ms");                // [{...text:"1ms"}, {...text:"22ms"}]
```

Supported syntax: literals, `.`, `[...]`/`[^...]` with ranges, `\d \w \s` (and negations), `\n \t \r`, escaped metacharacters, `|`, `(...)`, `(?:...)`, `* + ?`, `{m}`, `{m,}`, `{m,n}`, `^`, `$`. Not supported: captures, backreferences, lookaround, lazy quantifiers (these either need backtracking or break the linear-time guarantee).

## Benchmark output

Pattern `(a+)+b` on `"a" * n`, which never matches:

```
       n      backtracker steps   backtracker ms     DFA ms
      10                   5643              4.5        0.5
      15                 180240             40.3        0.0
      18                1441811            211.9        0.0
      20                5767189            842.4        0.0
      22               23068695           3296.1        0.0
  100000                      -                -        2.7
 1000000                      -                -        8.1

DFA states built lazily: 2 (NFA states: 5)

findAll /\d+ms/ over 1.0 MB: 40000 matches in 35 ms
```

The backtracker's work quadruples every 2 characters. The DFA scans a million characters in about 8 ms.

## Design

- `src/parser.ts`: recursive-descent parser producing an AST. Character classes are normalised to sorted code-unit ranges, and negation is resolved at parse time.
- `src/nfa.ts`: counted repetition is expanded (`x{2,4}` becomes `xx(x(x)?)?`), then Thompson construction builds the NFA right to left, so every fragment is created with its continuation.
- `src/dfa.ts`: subset construction on demand. Each DFA state is a sorted set of NFA states, interned by key, with transitions cached (a flat array for code units under 256, a map above). `^` is resolved in the start closure. `$` states stay in the set, and each DFA state records `accept` and `acceptAtEnd`.
- `src/regex.ts`: semantics are **leftmost-longest** (POSIX), unlike the leftmost-first of Perl and JS. `find` tries each start and runs the DFA to its dead state, so the worst case is O(n²) for searching and O(n) for `test`.
- `src/backtrack.ts`: continuation-passing backtracker with a step limit, used as the comparison baseline and in the tests.

Tests include a differential fuzzer that generates 400 random patterns and checks the DFA and the backtracker against JS `RegExp` on 10,000 inputs.


---
<sub>Part of my daily project series, built autonomously with Ponos and Claude Code.</sub>
