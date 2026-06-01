/*
 * Bot Web Worker'i (ES module worker).
 * Ana thread'den { type:"init", model, maxDepth, timeMs } ve
 * { type:"move", fen, depth?, maxDepth?, timeMs? } mesajlari alir,
 * en iyi hamleyi { type:"bestmove", move, score, depthReached, ms } olarak doner.
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
    engine = makeEngine(evaluator, Chess, {
      maxDepth: msg.maxDepth || msg.depth || 4,
      timeMs: msg.timeMs != null ? msg.timeMs : 1000,
    });
    self.postMessage({ type: "ready" });
    return;
  }
  if (msg.type === "move") {
    if (!engine) {
      self.postMessage({ type: "error", error: "engine hazir degil" });
      return;
    }
    const t0 = Date.now();
    // Iterative deepening + zaman butcesi. Geriye uyumluluk: sadece depth
    // gelirse onu maxDepth gibi kullan (zaman siniri yok).
    let arg;
    if (msg.timeMs != null || msg.maxDepth != null) {
      arg = { maxDepth: msg.maxDepth || msg.depth, timeMs: msg.timeMs };
    } else if (msg.depth != null) {
      arg = msg.depth; // eski cagri: sabit derinlik
    }
    const r = engine.bestMove(msg.fen, arg);
    const ms = Date.now() - t0;
    self.postMessage({
      type: "bestmove",
      move: r.move ? { from: r.move.from, to: r.move.to, promotion: r.move.promotion } : null,
      san: r.move ? r.move.san : null,
      score: r.score,
      evaluated: r.evaluated,
      depthReached: r.depthReached,
      ms,
    });
  }
};
