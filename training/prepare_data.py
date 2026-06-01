"""
games.csv -> egitim verisi (X ozellikler, y kazanma etiketi).

Her oyunu SAN hamleleriyle yeniden oynar, oyundan birkac pozisyon ornekler.
Her ornek pozisyona oyunun NIHAI sonucunu etiket olarak atar:
    beyaz kazandi -> 1.0,  siyah kazandi -> 0.0,  beraberlik -> 0.5

Boylece model "insan ne oynar" degil, "bu pozisyon kazanir mi" ogrenir.

Cikti: training/dataset.npz  (X: float32 [N,12], y: float32 [N])
"""

import csv
import sys
import random
import numpy as np
import chess

from features import board_features, NUM_FEATURES

CSV_PATH = "../games.csv"
OUT_PATH = "dataset.npz"

# Her oyundan kac pozisyon ornekleyelim (acilis disindan, rastgele).
SAMPLES_PER_GAME = 6
# Ilk N yari-hamleyi atla (acilislar cogu oyunda ayni, az bilgi tasir).
SKIP_OPENING_PLIES = 8
# Tekrar uretilebilirlik
random.seed(42)


def winner_label(winner: str) -> float:
    w = winner.strip().lower()
    if w == "white":
        return 1.0
    if w == "black":
        return 0.0
    return 0.5  # draw / outoftime-draw vb.


def main():
    X = []
    y = []
    games_used = 0
    games_skipped = 0

    with open(CSV_PATH, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            moves_str = row.get("moves", "").strip()
            if not moves_str:
                games_skipped += 1
                continue

            label = winner_label(row.get("winner", ""))
            san_moves = moves_str.split()

            board = chess.Board()
            positions = []  # bu oyunda gorulen (feature, board) anlari

            ok = True
            for ply, san in enumerate(san_moves):
                try:
                    board.push_san(san)
                except (ValueError, AssertionError):
                    ok = False
                    break
                if ply >= SKIP_OPENING_PLIES:
                    positions.append(board_features(board))

            if not ok or not positions:
                games_skipped += 1
                continue

            # Oyundan rastgele birkac pozisyon sec
            k = min(SAMPLES_PER_GAME, len(positions))
            for feats in random.sample(positions, k):
                X.append(feats)
                y.append(label)

            games_used += 1
            if (i + 1) % 2000 == 0:
                print(f"  islenen oyun: {i+1}, ornek: {len(X)}", flush=True)

    X = np.asarray(X, dtype=np.float32)
    y = np.asarray(y, dtype=np.float32)

    assert X.shape[1] == NUM_FEATURES, f"ozellik boyutu beklenenden farkli: {X.shape[1]} != {NUM_FEATURES}"

    np.savez_compressed(OUT_PATH, X=X, y=y)
    print(f"\nKullanilan oyun: {games_used}, atlanan: {games_skipped}")
    print(f"Toplam ornek: {len(X)}, ozellik boyutu: {X.shape[1]}")
    print(f"Etiket dagilimi -> beyaz_kazandi: {(y==1.0).sum()}, "
          f"siyah_kazandi: {(y==0.0).sum()}, beraberlik: {(y==0.5).sum()}")
    print(f"Kaydedildi: {OUT_PATH}")


if __name__ == "__main__":
    main()
