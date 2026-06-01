/*
 * Bot Web Worker'i (ES module worker).
 * Ana thread'den { type:"init", model } ve { type:"move", fen, depth } mesajlari alir,
 * en iyi hamleyi { type:"bestmove", move, score, ms } olarak doner.
 * Arama ana thread yerine burada calistigi icin UI donmaz.
 */
import { Chess } from "./node_modules/chess.js/dist/esm/chess.js";
import { makeEvaluator } from "./evaluate.js";
import { makeEngine } from "./engine.js";

let engine = null;

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "init") {
    const evaluator = makeEvaluator(msg.model);
    engine = makeEngine(evaluator, Chess, { depth: msg.depth || 3 });
    self.postMessage({ type: "ready" });
    return;
  }
  if (msg.type === "move") {
    if (!engine) {
      self.postMessage({ type: "error", error: "engine hazir degil" });
      return;
    }
    const t0 = Date.now();
    const r = engine.bestMove(msg.fen, msg.depth);
    const ms = Date.now() - t0;
    self.postMessage({
      type: "bestmove",
      // verbose move'u UI'in chess.js'ine geri uygulayabilmek icin sade alanlar:
      move: r.move ? { from: r.move.from, to: r.move.to, promotion: r.move.promotion } : null,
      san: r.move ? r.move.san : null,
      score: r.score,
      evaluated: r.evaluated,
      ms,
    });
  }
};
