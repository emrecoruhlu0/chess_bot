"""
Model parity testi: parity_cases.json'daki FEN'ler icin Python'un kazanma
olasiligini (export edilen kazanan modelle) hesaplar ve eval_cases.json'a yazar.

JS tarafi (web/verify_eval.js) ayni FEN'leri web/model.json ile hesaplayip
karsilastirir. Boylece scaler + forward-pass'in iki tarafta birebir ayni
oldugu garanti edilir.

Onemli: Buradaki olasilik, sklearn modelinin predict_proba'sindan DEGIL,
export edilen model.json uzerinden HESAPLANIR. Boylece tam olarak JS'in
calistirdigi sayisal yolu test ederiz (transpoze, aktivasyon sirasi dahil).
"""

import json
import math
import chess
from features import board_features


def sigmoid(z):
    return 1.0 / (1.0 + math.exp(-z))


def apply_scaler(f, sc):
    if not sc:
        return f
    return [(f[i] - sc["mean"][i]) / sc["std"][i] for i in range(len(f))]


def eval_model(model, feats):
    x = apply_scaler(feats, model.get("scaler"))
    if model["type"] == "mlp":
        layers = model["layers"]
        for li, L in enumerate(layers):
            W, b = L["W"], L["b"]
            is_last = li == len(layers) - 1
            out = []
            for o in range(len(b)):
                s = b[o]
                row = W[o]
                for i in range(len(x)):
                    s += row[i] * x[i]
                out.append(s if is_last else (s if s > 0 else 0.0))  # relu
            x = out
        return sigmoid(x[0])
    # logistic_regression
    w, b = model["weights"], model["intercept"]
    z = b
    for i in range(len(w)):
        z += w[i] * x[i]
    return sigmoid(z)


def main():
    with open("../web/model.json", encoding="utf-8") as f:
        model = json.load(f)
    with open("parity_cases.json", encoding="utf-8") as f:
        cases = json.load(f)

    out = []
    for c in cases:
        fen = c["fen"]
        feats = board_features(chess.Board(fen))
        out.append({"fen": fen, "winProbWhite": eval_model(model, feats)})

    with open("eval_cases.json", "w", encoding="utf-8") as f:
        json.dump(out, f)
    print(f"{len(out)} pozisyon yazildi -> eval_cases.json  (model tipi: {model['type']})")


if __name__ == "__main__":
    main()
