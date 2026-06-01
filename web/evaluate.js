/*
 * Pozisyon degerlendirme: egitilmis model ile "beyazin kazanma olasiligi"
 * (0..1) hesaplar. Iki model tipini destekler:
 *
 *   logistic_regression:  p = sigmoid( w . z + b )
 *   mlp:                   p = sigmoid( W2 . relu(W1 . z + b1) + b2 )
 *
 * Her iki durumda z = (features - scaler.mean) / scaler.std (varsa).
 *
 * model.json yapilari:
 *   { type:"logistic_regression", weights:[...], intercept, scaler:{mean,std} }
 *   { type:"mlp", layers:[{W,b,activation}...], scaler:{mean,std} }
 * W layout: W[out][in] (export'ta sklearn coefs_'tan transpoze edilmistir).
 *
 * features.js: featuresFromFen(fen) -> ozellik vektoru (Python ile birebir).
 *
 * ES modulu (import) ile tarayicida ve Node'da calisir.
 */
import { featuresFromFen } from "./features.js";

export function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

function relu(x) {
  return x > 0 ? x : 0;
}

// Ozellikleri scaler ile olcekle: (x - mean) / std. Scaler yoksa aynen dondur.
function applyScaler(f, sc) {
  if (!sc) return f;
  const out = new Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = (f[i] - sc.mean[i]) / sc.std[i];
  return out;
}

// Tek yogun (dense) katman: y[o] = act( b[o] + sum_i W[o][i] * x[i] ).
function denseLayer(x, W, b, activation) {
  const out = new Array(b.length);
  for (let o = 0; o < b.length; o++) {
    let s = b[o];
    const row = W[o];
    for (let i = 0; i < x.length; i++) s += row[i] * x[i];
    out[o] = activation === "relu" ? relu(s) : s;
  }
  return out;
}

export function makeEvaluator(model) {
  const sc = model.scaler || null;

  if (model.type === "mlp") {
    const layers = model.layers;
    if (!Array.isArray(layers)) throw new Error("mlp model.layers dizi degil");

    function winProbWhite(fen) {
      let x = applyScaler(featuresFromFen(fen), sc);
      // Son katman haric tum katmanlar relu (export activation alanina gore).
      for (let li = 0; li < layers.length; li++) {
        const L = layers[li];
        const isLast = li === layers.length - 1;
        const act = isLast ? "linear" : L.activation; // son katmanin linear toplami
        x = denseLayer(x, L.W, L.b, act);
      }
      // Son katman tek cikis -> sigmoid.
      return sigmoid(x[0]);
    }

    return { winProbWhite, model };
  }

  // logistic_regression (varsayilan)
  const w = model.weights;
  const b = model.intercept;
  if (!Array.isArray(w)) throw new Error("model.weights dizi degil");

  function winProbWhite(fen) {
    const f = applyScaler(featuresFromFen(fen), sc);
    if (f.length !== w.length) {
      throw new Error(`ozellik boyutu uyumsuz: ${f.length} != ${w.length}`);
    }
    let z = b;
    for (let i = 0; i < w.length; i++) z += w[i] * f[i];
    return sigmoid(z);
  }

  return { winProbWhite, model };
}
