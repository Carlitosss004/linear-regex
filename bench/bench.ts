import { Regex, parse, backtrackFullMatch, StepLimitExceeded } from "../src/index.js";

const pattern = "(a+)+b";
const re = new Regex(pattern);
const ast = parse(pattern);

console.log(`Pattern /${pattern}/ against "a"*n (no match: the classic ReDoS case)\n`);
console.log("n".padStart(8), "backtracker steps".padStart(22), "backtracker ms".padStart(16), "DFA ms".padStart(10));
for (const n of [10, 15, 18, 20, 22, 100_000, 1_000_000]) {
  const input = "a".repeat(n);
  let t = performance.now();
  let steps = "-";
  let btMs = "-";
  if (n <= 30) {
    try {
      steps = String(backtrackFullMatch(ast, input, 200_000_000).steps);
    } catch (e) {
      if (!(e instanceof StepLimitExceeded)) throw e;
      steps = "> 200000000";
    }
    btMs = (performance.now() - t).toFixed(1);
  }
  t = performance.now();
  re.test(input);
  const dfaMs = (performance.now() - t).toFixed(1);
  console.log(String(n).padStart(8), steps.padStart(22), btMs.padStart(16), dfaMs.padStart(10));
}
console.log(`\nDFA states built lazily: ${re.dfaSize} (NFA states: ${re.nfaSize})`);

const log = ("GET /index.html 200 12ms\n".repeat(40_000));
const ip = new Regex("\\d+ms");
const t0 = performance.now();
const all = ip.findAll(log);
console.log(`\nfindAll /\\d+ms/ over ${(log.length / 1e6).toFixed(1)} MB: ${all.length} matches in ${(performance.now() - t0).toFixed(0)} ms`);
