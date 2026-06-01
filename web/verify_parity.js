/*
 * Parity testi: training/parity_cases.json icindeki FEN'lerin Python
 * ozelliklerini, features.js'in JS ciktisi ile karsilastirir.
 * Calistir: node web/verify_parity.js
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { featuresFromFen, FEATURE_NAMES } from "./features.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const casesPath = join(__dirname, "..", "training", "parity_cases.json");
const cases = JSON.parse(readFileSync(casesPath, "utf-8"));

const EPS = 1e-6;
let failed = 0;

for (const { fen, features: py } of cases) {
  const js = featuresFromFen(fen);
  if (js.length !== py.length) {
    console.error(`UZUNLUK FARKI  ${fen}\n  py=${py.length} js=${js.length}`);
    failed++;
    continue;
  }
  const diffs = [];
  for (let i = 0; i < py.length; i++) {
    if (Math.abs(py[i] - js[i]) > EPS) {
      diffs.push(`${FEATURE_NAMES[i]}: py=${py[i]} js=${js[i]}`);
    }
  }
  if (diffs.length) {
    console.error(`FARK  ${fen}`);
    diffs.forEach((d) => console.error("    " + d));
    failed++;
  } else {
    console.log(`OK    ${fen}`);
  }
}

if (failed) {
  console.error(`\n${failed} pozisyonda PARITY HATASI var!`);
  process.exit(1);
} else {
  console.log(`\nTum ${cases.length} pozisyon Python ile birebir ayni. PARITY OK.`);
}
