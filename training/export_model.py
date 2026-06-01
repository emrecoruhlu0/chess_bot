"""
model_sklearn.joblib -> web/model.json  ve  model/model.json

JS tarafi sadece agirlik vektoru + intercept'e ihtiyac duyar:
    p(beyaz kazanir) = sigmoid(w . features + b)
Ozellik adlarini da denetim icin yaziyoruz.
"""

import json
import joblib
from features import FEATURE_NAMES

clf = joblib.load("model_sklearn.joblib")

model = {
    "type": "logistic_regression",
    "feature_names": FEATURE_NAMES,
    "weights": clf.coef_[0].tolist(),
    "intercept": float(clf.intercept_[0]),
}

# Hem web/ hem model/ klasorune yaz (web dogrudan kullanir, model/ arsivdir).
for path in ("../web/model.json", "../model/model.json"):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(model, f, indent=2)
    print(f"Yazildi: {path}")

print(f"\nOzellik sayisi: {len(model['weights'])}")
print(f"Intercept: {model['intercept']:.4f}")
