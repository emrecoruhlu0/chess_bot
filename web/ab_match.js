/*
 * A/B maci: yeni botun eski botan guclu oldugunu kanitlar.
 * Iki ayri karsilastirma yapar (her degisikligin katkisini izole eder):
 *
 *   (A) ARAMA: ayni (yeni) model, eski-motor (sabit derinlik 3) vs
 *       yeni-motor (quiescence+TT+iterative deepening, ayni derinlik 3).
 *   (B) MODEL: ayni (yeni) motor, eski-model (12 ozellik LR) vs
 *       yeni-model (23 ozellik MLP).
 *
 * Her es N oyun oynar, renkleri degistirir, ilk birkac hamleyi rastgele
 * yaparak ozdes oyunlardan kacinir. Sonuc: W/L/D ve yeni-bot kazanma orani.
 *
 * Calistir: node web/ab_match.js [oyunSayisi]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Chess } from "chess.js";

import { makeEvaluator as makeEvalNew } from "./evaluate.js";
import { makeEngine as makeEngineNew } from "./engine.js";
import { makeEvaluator as makeEvalOld } from "./_old_evaluate.js";
import { makeEngine as makeEngineOld } from "./_old_engine.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const newModel = JSON.parse(readFileSync(join(__dirname, "model.json"), "utf-8"));
const oldModel = JSON.parse(readFileSync(join(__dirname, "model_old.json"), "utf-8"));

const N = Number(process.argv[2]) || 40;
const MAX_PLIES = 160;
// Esit butce: iterative deepening + hamle basi zaman siniri (gercek oyundaki
// gibi). Sabit derinlik yerine zaman, hizli ve adil karsilastirma saglar.
const MOVE_TIME_MS = Number(process.argv[3]) || 150;
const MAX_DEPTH = 6;
const RANDOM_OPENING_PLIES = 4;

// Deterministik psodo-rastgele (tekrar uretilebilir maclar).
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * Tek oyun. white/black: { pickMove(fen) -> verbose move }.
 * Doner: "white" | "black" | "draw".
 */
function playGame(white, black, rng) {
  const game = new Chess();
  let ply = 0;
  // Rastgele acilis (iki taraf da ayni hamleleri yapar -> adil cesitlilik).
  for (let i = 0; i < RANDOM_OPENING_PLIES && !game.isGameOver(); i++) {
    const moves = game.moves({ verbose: true });
    const m = moves[Math.floor(rng() * moves.length)];
    game.move(m);
    ply++;
  }
  while (!game.isGameOver() && ply < MAX_PLIES) {
    const side = game.turn() === "w" ? white : black;
    const m = side.pickMove(game.fen());
    if (!m) break;
    // Motor ayri bir Chess ornegi kullanir; verbose move'u sade alanlarla uygula
    // (before/after gibi alanlar farkli ornekten gelince chess.js reddedebilir).
    game.move({ from: m.from, to: m.to, promotion: m.promotion });
    ply++;
  }
  if (game.isCheckmate()) return game.turn() === "w" ? "black" : "white";
  return "draw"; // pat/beraberlik/limit -> beraberlik say
}

/*
 * Bir es: botA vs botB, N oyun, renk degisimli. botMaker(color)->{pickMove}.
 * Doner: { aWins, bWins, draws }.
 */
function runMatch(label, makeA, makeB) {
  let aWins = 0, bWins = 0, draws = 0;
  const rng = mulberry32(12345);
  for (let g = 0; g < N; g++) {
    const aIsWhite = g % 2 === 0;
    const white = aIsWhite ? makeA() : makeB();
    const black = aIsWhite ? makeB() : makeA();
    const res = playGame(white, black, rng);
    if (res === "draw") draws++;
    else if ((res === "white") === aIsWhite) aWins++;
    else bWins++;
    process.stdout.write(`\r  ${label}: ${g + 1}/${N}  A=${aWins} B=${bWins} D=${draws}   `);
  }
  process.stdout.write("\n");
  return { aWins, bWins, draws };
}

// pickMove yardimcilari.
function pickerFixed(engine, depth) {
  return { pickMove: (fen) => engine.bestMove(fen, depth).move };
}
function pickerTimed(engine, maxDepth, timeMs) {
  return { pickMove: (fen) => engine.bestMove(fen, { maxDepth, timeMs }).move };
}

console.log(`A/B maci: ${N} oyun/es\n`);

// --- (A) ARAMA: yeni model, eski-motor (sabit derinlik 2) vs yeni-motor
//     (ayni 2 derinlik + quiescence/TT). Esit derinlikte yeni eklentilerin
//     (quiescence taktigi) katkisini gosterir. ---
{
  const evalNew = makeEvalNew(newModel);
  const D = 2;
  const makeNewEngine = () => pickerFixed(makeEngineNew(evalNew, Chess, { depth: D }), D);
  const makeOldEngine = () => pickerFixed(makeEngineOld(evalNew, Chess, { depth: D }), D);
  console.log(`(A) ARAMA  A=yeni-motor  B=eski-motor  (ayni yeni model, derinlik ${D})`);
  const r = runMatch("arama", makeNewEngine, makeOldEngine);
  const rate = (r.aWins + r.draws * 0.5) / N;
  console.log(`  -> yeni-motor skoru: ${(rate * 100).toFixed(1)}%  (W${r.aWins}-L${r.bWins}-D${r.draws})\n`);
}

// --- (B) MODEL: yeni motor (zaman butceli), eski-model vs yeni-model.
//     Esit zaman butcesinde modelin katkisini gosterir. ---
{
  const evalNew = makeEvalNew(newModel);
  const evalOld = makeEvalOld(oldModel);
  const makeNewModel = () => pickerTimed(makeEngineNew(evalNew, Chess, {}), MAX_DEPTH, MOVE_TIME_MS);
  const makeOldModel = () => pickerTimed(makeEngineNew(evalOld, Chess, {}), MAX_DEPTH, MOVE_TIME_MS);
  console.log(`(B) MODEL  A=yeni-model(${newModel.type},23)  B=eski-model(${oldModel.type},12)  (ayni motor, ${MOVE_TIME_MS}ms/hamle)`);
  const r = runMatch("model", makeNewModel, makeOldModel);
  const rate = (r.aWins + r.draws * 0.5) / N;
  console.log(`  -> yeni-model skoru: ${(rate * 100).toFixed(1)}%  (W${r.aWins}-L${r.bWins}-D${r.draws})\n`);
}

console.log("Not: skor = (galibiyet + 0.5*beraberlik) / oyun. >%50 = yeni bot daha guclu.");
