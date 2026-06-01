/*
 * Model parity testi: training/eval_cases.json icindeki Python kazanma
 * olasiliklarini, evaluate.js + model.json'in JS ciktisi ile karsilastirir.
 * Boylece scaler + (MLP/LR) forward-pass iki tarafta birebir ayni mi dogrular.
 * Calistir: node web/verify_eval.js
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makeEvaluator } from "./evaluate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const model = JSON.parse(readFileSync(join(__dirname, "model.json"), "utf-8"));
const casesPath = join(__dirname, "..", "training", "eval_cases.json");
const cases = JSON.parse(readFileSync(casesPath, "utf-8"));

const evaluator = makeEvaluator(model);
const EPS = 1e-9;
let failed = 0;

for (const { fen, winProbWhite: py } of cases) {
  const js = evaluator.winProbWhite(fen);
  const diff = Math.abs(py - js);
  if (diff > EPS) {
    console.error(`FARK  ${fen}\n  py=${py} js=${js} diff=${diff}`);
    failed++;
  } else {
    console.log(`OK    ${fen}  p=${js.toFixed(6)}`);
  }
}

if (failed) {
  console.error(`\n${failed} pozisyonda MODEL PARITY HATASI var!`);
  process.exit(1);
} else {
  console.log(`\nTum ${cases.length} pozisyon Python ile birebir ayni (model: ${model.type}). PARITY OK.`);
}
