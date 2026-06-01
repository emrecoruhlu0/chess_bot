"""
Parity testi icin: bir dizi FEN'in Python ozelliklerini JSON'a yazar.
Node tarafi (web/verify_parity.js) ayni FEN'leri JS ile hesaplayip karsilastirir.
"""

import json
import chess
from features import board_features

# Cesitli pozisyonlar: baslangic, acilis, orta oyun, son oyun, ozel kareler.
# Yeni ozellikleri (mobility, piyon yapisi, sah guvenligi) tetikleyen
# pozisyonlar da eklenmistir.
FENS = [
    chess.STARTING_FEN,
    "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2",
    "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 3",
    "8/8/8/4k3/8/4K3/4P3/8 w - - 0 1",
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    "rnbq1rk1/ppp1bppp/4pn2/3p4/2PP4/2N1PN2/PP3PPP/R1BQKB1R w KQ - 0 6",
    "q7/8/8/8/8/8/8/7K b - - 0 1",
    # Ikili (doubled) piyon: d-dosyasinda beyaz iki piyon.
    "4k3/8/8/8/3P4/3P4/8/4K3 w - - 0 1",
    # Izole piyon: beyaz a ve h piyonlari komsusuz.
    "4k3/8/8/8/8/8/P6P/4K3 w - - 0 1",
    # Gecer piyon: beyaz e-piyonu, onunde rakip piyon yok.
    "4k3/8/8/4P3/8/8/8/4K3 w - - 0 1",
    # Roklanmis sah + piyon silti (g1 sah, f2-g2-h2 piyon).
    "r4rk1/ppp2ppp/8/8/8/8/PPP2PPP/R4RK1 w - - 0 1",
    # Sah saldiri altinda: siyah sah etrafinda beyaz tas baskisi.
    "6k1/5ppp/8/8/8/8/5Q2/6K1 w - - 0 1",
    # Acik/yari-acik dosyada kale.
    "3rk3/8/8/8/8/8/8/3RK3 w - - 0 1",
    # En passant mevcut pozisyon (ozellige dahil edilmemeli; parity testi).
    "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3",
    # Cok kayan tas (acik tahta orta oyun).
    "2rq1rk1/pp1bbppp/2n1pn2/3p4/3P4/2NBPN2/PPQ1BPPP/2R2RK1 w - - 0 11",
    # Karmasik son oyun.
    "8/5pk1/6p1/8/8/1P3PP1/5K2/8 b - - 0 1",
    # Vezir baskisi altinda yalin sah.
    "8/8/8/8/8/5k2/6q1/7K w - - 0 1",
]

out = []
for fen in FENS:
    board = chess.Board(fen)
    out.append({"fen": fen, "features": board_features(board)})

with open("parity_cases.json", "w", encoding="utf-8") as f:
    json.dump(out, f)

print(f"{len(out)} pozisyon yazildi -> parity_cases.json")
