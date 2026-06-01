"""
model_sklearn.joblib -> web/model.json  ve  model/model.json

train.py iki model uretir (lr, mlp) + ortak scaler. Kazanani (veya --model ile
secileni) JSON'a aktarir. JS tarafi (evaluate.js) model.type'a gore dallanir.

JSON formatlari:
  Logistic regression:
    { "type":"logistic_regression", "feature_names":[...],
      "weights":[...], "intercept": float,
      "scaler": {"mean":[...], "std":[...]} }

  MLP (tek gizli katman):
    { "type":"mlp", "feature_names":[...],
      "scaler": {"mean":[...], "std":[...]},
      "layers": [
        {"W": [[...]], "b":[...], "activation":"relu"},     # giris -> gizli
        {"W": [[...]], "b":[...], "activation":"sigmoid"}    # gizli -> cikis(1)
      ] }

ONEMLI: sklearn coefs_[i] sekli [in, out]. JS forward-pass W[out][in] bekler;
bu yuzden export'ta TRANSPOZE edilir. Tum sayilar float64 (parity icin).
"""

import json
import sys
import joblib

bundle = joblib.load("model_sklearn.joblib")
lr = bundle["lr"]
mlp = bundle["mlp"]
scaler = bundle["scaler"]
feature_names = bundle["feature_names"]

# Hangi model? --model lr|mlp|auto (varsayilan: train.py'nin sectigi kazanan)
choice = "auto"
for i, a in enumerate(sys.argv):
    if a == "--model" and i + 1 < len(sys.argv):
        choice = sys.argv[i + 1].lower()
if choice == "auto":
    choice = bundle.get("winner", "lr")

scaler_obj = {
    "mean": scaler.mean_.astype(float).tolist(),
    "std": scaler.scale_.astype(float).tolist(),
}

if choice == "lr":
    model = {
        "type": "logistic_regression",
        "feature_names": feature_names,
        "weights": lr.coef_[0].astype(float).tolist(),
        "intercept": float(lr.intercept_[0]),
        "scaler": scaler_obj,
    }
elif choice == "mlp":
    layers = []
    n_layers = len(mlp.coefs_)
    for li in range(n_layers):
        W = mlp.coefs_[li]          # sekil [in, out]
        b = mlp.intercepts_[li]     # sekil [out]
        # Transpoze: W[out][in]
        W_t = [[float(W[i][o]) for i in range(W.shape[0])]
               for o in range(W.shape[1])]
        # Son katman cikis -> sigmoid; ara katmanlar -> relu.
        activation = "sigmoid" if li == n_layers - 1 else "relu"
        layers.append({"W": W_t, "b": [float(x) for x in b],
                       "activation": activation})
    model = {
        "type": "mlp",
        "feature_names": feature_names,
        "scaler": scaler_obj,
        "layers": layers,
    }
else:
    raise SystemExit(f"Bilinmeyen model secimi: {choice}")

for path in ("../web/model.json", "../model/model.json"):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(model, f, indent=2)
    print(f"Yazildi: {path}")

print(f"\nModel tipi: {model['type']}")
print(f"Ozellik sayisi: {len(feature_names)}")
