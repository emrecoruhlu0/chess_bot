"""
dataset.npz -> egitilmis degerlendirme modeli (LR baseline + kucuk MLP).

Model: pozisyon ozellikleri -> beyazin kazanma olasiligi (0..1).
Beraberlik (y=0.5) ornekleri, hem 0 hem 1 sinifina yarim ornek-agirligiyla
eklenir; boylece "notr" sinyal verirler.

Iki model egitilir ve test log-loss'una gore karsilastirilir:
  - LogisticRegression (acik, ogrenilen agirliklar = tas degerleri)
  - MLPClassifier (tek gizli katman, ReLU) -- dogrusal olmayan iliskiler

Ozellikler StandardScaler ile olceklenir (MLP icin zorunlu, LR icin zararsiz).
Scaler hem LR hem MLP icin ayni; export sirasinda JSON'a yazilir.

Cikti:
  - training/model_sklearn.joblib  -> {"lr","mlp","scaler","winner"}
  - terminalde karsilastirma raporu
JSON'a aktarim export_model.py'de yapilir.
"""

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.neural_network import MLPClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, log_loss
import joblib

from features import FEATURE_NAMES

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
    return (np.asarray(Xs, np.float64), np.asarray(ys, np.float64),
            np.asarray(ws, np.float64))


def oversample_for_mlp(X, y, w):
    """MLPClassifier.fit sample_weight almaz. Yarim-agirlikli beraberlik
    satirlarini integer oversampling ile yaklas: non-draw satirlari iki kez
    (agirlik 1.0 == iki yarim), her draw-sinifi satirini bir kez (agirlik 0.5)
    ekle. Boylece efektif agirliklar expand_draws ile ayni oranda kalir."""
    Xs, ys = [], []
    for xi, yi, wi in zip(X, y, w):
        reps = 2 if wi >= 1.0 else 1  # 1.0 -> 2 kopya, 0.5 -> 1 kopya
        for _ in range(reps):
            Xs.append(xi); ys.append(yi)
    return np.asarray(Xs, np.float64), np.asarray(ys, np.float64)


def report(name, proba, y_true):
    pred = (proba > 0.5).astype(np.float64)
    acc = accuracy_score(y_true, pred)
    ll = log_loss(y_true, proba, labels=[0.0, 1.0])
    print(f"  {name:>4}  dogruluk={acc:.4f}  log-loss={ll:.4f}  (n={len(y_true)})")
    return acc, ll


def main():
    d = np.load(DATA)
    X, y = d["X"].astype(np.float64), d["y"].astype(np.float64)
    print(f"Yuklenen: X={X.shape}, y={y.shape}, ozellik sayisi={X.shape[1]}")

    # Once train/test ayir (orijinal etiketlerle), sonra train'de beraberlikleri genislet.
    X_tr, X_te, y_tr, y_te = train_test_split(
        X, y, test_size=0.15, random_state=42, stratify=(y == 1.0)
    )
    X_tr_e, y_tr_e, w_tr_e = expand_draws(X_tr, y_tr)

    # Olcekleyiciyi egitim ozellikleri uzerinde fit et (hem LR hem MLP ayni scaler).
    scaler = StandardScaler().fit(X_tr_e)
    X_tr_s = scaler.transform(X_tr_e)

    # Test: beraberlikleri cikar (net kazanan/kaybeden uzerinde olc).
    mask = y_te != 0.5
    X_te_c, y_te_c = X_te[mask], y_te[mask]
    X_te_s = scaler.transform(X_te_c)

    # --- LR baseline (olcekli ozelliklerle) ---
    lr = LogisticRegression(max_iter=2000, C=1.0)
    lr.fit(X_tr_s, y_tr_e, sample_weight=w_tr_e)
    lr_proba = lr.predict_proba(X_te_s)[:, 1]

    # --- MLP (tek gizli katman, ReLU) ---
    X_tr_mlp, y_tr_mlp = oversample_for_mlp(X_tr_s, y_tr_e, w_tr_e)
    mlp = MLPClassifier(
        hidden_layer_sizes=(24,), activation="relu",
        max_iter=400, early_stopping=True, random_state=42,
    )
    mlp.fit(X_tr_mlp, y_tr_mlp)
    mlp_proba = mlp.predict_proba(X_te_s)[:, 1]

    print(f"\nTest (beraberlikler haric):")
    _, lr_ll = report("LR", lr_proba, y_te_c)
    _, mlp_ll = report("MLP", mlp_proba, y_te_c)

    # Kazanan = dusuk log-loss.
    winner = "lr" if lr_ll <= mlp_ll else "mlp"
    print(f"\nKAZANAN: {winner.upper()}  (dusuk log-loss tercih edilir)")

    print("\nLR ogrenilen katsayilar (OLCEKLI ozellik uzerinde):")
    for name, w in zip(FEATURE_NAMES, lr.coef_[0]):
        print(f"  {name:>16}: {w:+.4f}")
    print(f"  {'intercept':>16}: {lr.intercept_[0]:+.4f}")

    joblib.dump(
        {"lr": lr, "mlp": mlp, "scaler": scaler,
         "winner": winner, "feature_names": list(FEATURE_NAMES)},
        OUT_MODEL,
    )
    print(f"\nModel paketi kaydedildi: {OUT_MODEL}")


if __name__ == "__main__":
    main()
