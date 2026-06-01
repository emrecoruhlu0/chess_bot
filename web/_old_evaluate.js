/*
 * Pozisyon degerlendirme: egitilmis lojistik regresyon modeliyle
 * "beyazin kazanma olasiligi" (0..1) hesaplar.
 *
 *   p = sigmoid( w . features + b )
 *
 * model.json: { weights:[...12], intercept: number, feature_names:[...] }
 * features.js: featuresFromFen(fen) -> 12 elemanli vektor
 *
 * ES modulu (import) ile tarayicida ve Node'da calisir.
 */
import { featuresFromFen } from "./_old_features.js";

export function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

export function makeEvaluator(model) {
  const w = model.weights;
  const b = model.intercept;
  if (!Array.isArray(w)) throw new Error("model.weights dizi degil");

  /* FEN -> beyazin kazanma olasiligi (0..1). */
  function winProbWhite(fen) {
    const f = featuresFromFen(fen);
    if (f.length !== w.length) {
      throw new Error(`ozellik boyutu uyumsuz: ${f.length} != ${w.length}`);
    }
    let z = b;
    for (let i = 0; i < w.length; i++) z += w[i] * f[i];
    return sigmoid(z);
  }

  return { winProbWhite, model };
}
