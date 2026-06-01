"""
dataset.npz -> egitilmis lojistik regresyon modeli.

Model: pozisyon ozellikleri -> beyazin kazanma olasiligi (0..1).
Beraberlik (y=0.5) ornekleri, hem 0 hem 1 sinifina yarim ornek-agirligiyla
eklenir; boylece "notr" sinyal verirler.

Cikti:
  - training/model_sklearn.joblib  (Python tarafi denetim icin)
  - terminalde dogruluk/raporlar
Agirliklarin JSON'a aktarimi export_model.py'de yapilir.
"""

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, log_loss
import joblib

DATA = "dataset.npz"
OUT_MODEL = "model_sklearn.joblib"


def expand_draws(X, y):
    """y=0.5 ornekleri ikiye ayir (0 ve 1, yarim agirlik). Digerleri tam agirlik."""
    Xs, ys, ws = [], [], []
    for xi, yi in zip(X, y):
        if yi == 0.5:
            Xs.append(xi); ys.append(1.0); ws.append(0.5)
            Xs.append(xi); ys.append(0.0); ws.append(0.5)
        else:
            Xs.append(xi); ys.append(yi); ws.append(1.0)
    return np.asarray(Xs, np.float32), np.asarray(ys, np.float32), np.asarray(ws, np.float32)


def main():
    d = np.load(DATA)
    X, y = d["X"], d["y"]
    print(f"Yuklenen: X={X.shape}, y={y.shape}")

    # Once train/test ayir (orijinal etiketlerle), sonra train tarafinda beraberlikleri genislet.
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.15, random_state=42, stratify=(y == 1.0)
    )

    X_tr_e, y_tr_e, w_tr_e = expand_draws(X_tr, y_tr)

    clf = LogisticRegression(max_iter=2000, C=1.0)
    clf.fit(X_tr_e, y_tr_e, sample_weight=w_tr_e)

    # Test: beraberlikleri degerlendirmeden cikar (net kazanan/kaybeden uzerinde olc).
    mask = y_te != 0.5
    X_te_c, y_te_c = X_te[mask], y_te[mask]
    pred = clf.predict(X_te_c)
    proba = clf.predict_proba(X_te_c)[:, 1]

    acc = accuracy_score(y_te_c, pred)
    ll = log_loss(y_te_c, proba)
    print(f"\nTest (beraberlikler haric): n={len(y_te_c)}")
    print(f"  Dogruluk (kazanan tahmini): {acc:.4f}")
    print(f"  Log-loss:                   {ll:.4f}")

    print("\nOgrenilen katsayilar (ozellik -> agirlik):")
    from features import FEATURE_NAMES
    for name, w in zip(FEATURE_NAMES, clf.coef_[0]):
        print(f"  {name:>16}: {w:+.4f}")
    print(f"  {'intercept':>16}: {clf.intercept_[0]:+.4f}")

    joblib.dump(clf, OUT_MODEL)
    print(f"\nModel kaydedildi: {OUT_MODEL}")


if __name__ == "__main__":
    main()
