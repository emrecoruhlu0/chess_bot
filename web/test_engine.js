/*
 * Motor akil-sagligi testleri (Node). Calistir: node web/test_engine.js
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Chess } from "chess.js";
import { makeEvaluator } from "./evaluate.js";
import { makeEngine } from "./engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const model = JSON.parse(readFileSync(join(__dirname, "model.json"), "utf-8"));
const evaluator = makeEvaluator(model);

const cases = [
  { name: "baslangic (mantikli acilis)", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", expect: null },
  { name: "bedava vezir", fen: "rnb1kbnr/ppp1pppp/8/3q4/8/2N5/PPPPPPPP/R1BQKB1R w KQkq - 0 1", expect: "Nxd5" },
  { name: "mate-in-1", fen: "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1", expect: "Re8#" },
];

let failed = 0;

// 1) Sabit derinlik (geriye uyumlu cagri).
for (const d of [2, 3]) {
  const engine = makeEngine(evaluator, Chess, { depth: d });
  console.log(`\n=== sabit derinlik ${d} ===`);
  for (const c of cases) {
    const t0 = Date.now();
    const r = engine.bestMove(c.fen, d);
    const ms = Date.now() - t0;
    const san = r.move ? r.move.san : "YOK";
    const ok = c.expect == null ? true : san === c.expect;
    if (!ok) failed++;
    console.log(`  ${ok ? "OK " : "HATA"} ${c.name}: ${san} (skor=${r.score.toFixed(3)}, ${ms}ms)` +
      (c.expect ? `  beklenen=${c.expect}` : ""));
  }
}

// 2) Iterative deepening + zaman butcesi (yeni mod).
{
  const engine = makeEngine(evaluator, Chess, { maxDepth: 6, timeMs: 1000 });
  console.log(`\n=== iterative deepening (maxDepth=6, timeMs=1000) ===`);
  for (const c of cases) {
    const t0 = Date.now();
    const r = engine.bestMove(c.fen, { maxDepth: 6, timeMs: 1000 });
    const ms = Date.now() - t0;
    const san = r.move ? r.move.san : "YOK";
    const ok = c.expect == null ? true : san === c.expect;
    if (!ok) failed++;
    console.log(`  ${ok ? "OK " : "HATA"} ${c.name}: ${san} (skor=${r.score.toFixed(3)}, ` +
      `derinlik=${r.depthReached}, ${ms}ms)` + (c.expect ? `  beklenen=${c.expect}` : ""));
  }
}

console.log(failed ? `\n${failed} test BASARISIZ` : "\nTum motor testleri gecti.");
process.exit(failed ? 1 : 0);
