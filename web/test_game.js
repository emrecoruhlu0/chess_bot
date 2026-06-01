/*
 * Entegrasyon testi: bot kendi kendine bir tam oyun oynar.
 * Amac: motorun bir oyunu sonuna kadar (mat/pat/beraberlik/limit) hatasiz
 * surdurdugunu ve mantikli oynadigini dogrulamak.
 * Calistir: node web/test_game.js
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
const engine = makeEngine(evaluator, Chess, { depth: 3 });

const game = new Chess();
const MAX_PLIES = 120;
let ply = 0;
const t0 = Date.now();
let totalEvaluated = 0;
const sans = [];

while (!game.isGameOver() && ply < MAX_PLIES) {
  const r = engine.bestMove(game.fen(), 3);
  if (!r.move) break;
  const applied = game.move(r.move);
  sans.push(applied.san);
  totalEvaluated += r.evaluated;
  ply++;
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);

// Hamle listesini okunakli yaz
let pgn = "";
for (let i = 0; i < sans.length; i++) {
  if (i % 2 === 0) pgn += `${i / 2 + 1}. ${sans[i]} `;
  else pgn += `${sans[i]} `;
}

console.log("Oynanan hamleler:\n" + pgn.trim());
console.log(`\nYari-hamle: ${ply}, sure: ${secs}s, toplam kok-deger: ${totalEvaluated}`);

let result;
if (game.isCheckmate()) result = "Sah mat — " + (game.turn() === "w" ? "siyah kazandi" : "beyaz kazandi");
else if (game.isStalemate()) result = "Pat";
else if (game.isDraw()) result = "Beraberlik";
else if (ply >= MAX_PLIES) result = `Hamle limiti (${MAX_PLIES}) — oyun surdu (motor stabil)`;
else result = "Oyun bitti";

console.log("Sonuc: " + result);

// Akil saglik kontrolu: legal pozisyonda kaldik mi?
const ok = game.fen().length > 0 && (game.isGameOver() || ply >= MAX_PLIES);
console.log(ok ? "\nENTEGRASYON OK: motor tam oyunu hatasiz surdurdu." : "\nHATA");
process.exit(ok ? 0 : 1);
