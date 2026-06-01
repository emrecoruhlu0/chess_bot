"""
Pozisyondan sayisal ozellik cikarimi (Python tarafi).

ONEMLI: Bu dosyadaki mantik, web/features.js ile BIREBIR ayni sayilari
uretmek zorundadir. Birinde degisiklik yaparsan digerini de guncelle ve
training/verify_parity.py ile dogrula.

Tum ozellikler BEYAZ perspektifinden hesaplanir.
Ozellik vektoru (toplam 12 boyut):
  [0..4]  materyal farki: (beyaz - siyah) adet -> P, N, B, R, Q
  [5..10] piece-square tablo skoru / 100: P, N, B, R, Q, K
  [11]    sira: beyaz oynayacaksa +1, siyah oynayacaksa -1
"""

import chess

# Piyon-kare tablolari (beyaz perspektifi, a1=0 ... h8=63).
# Kaynak: yaygin kullanilan "simplified evaluation" PST'leri (Tomasz Michniewski).
# Degerler santipiyon (1 piyon = 100) cinsinden.
PST = {
    chess.PAWN: [
          0,   0,   0,   0,   0,   0,   0,   0,
          5,  10,  10, -20, -20,  10,  10,   5,
          5,  -5, -10,   0,   0, -10,  -5,   5,
          0,   0,   0,  20,  20,   0,   0,   0,
          5,   5,  10,  25,  25,  10,   5,   5,
         10,  10,  20,  30,  30,  20,  10,  10,
         50,  50,  50,  50,  50,  50,  50,  50,
          0,   0,   0,   0,   0,   0,   0,   0,
    ],
    chess.KNIGHT: [
        -50, -40, -30, -30, -30, -30, -40, -50,
        -40, -20,   0,   5,   5,   0, -20, -40,
        -30,   5,  10,  15,  15,  10,   5, -30,
        -30,   0,  15,  20,  20,  15,   0, -30,
        -30,   5,  15,  20,  20,  15,   5, -30,
        -30,   0,  10,  15,  15,  10,   0, -30,
        -40, -20,   0,   0,   0,   0, -20, -40,
        -50, -40, -30, -30, -30, -30, -40, -50,
    ],
    chess.BISHOP: [
        -20, -10, -10, -10, -10, -10, -10, -20,
        -10,   5,   0,   0,   0,   0,   5, -10,
        -10,  10,  10,  10,  10,  10,  10, -10,
        -10,   0,  10,  10,  10,  10,   0, -10,
        -10,   5,   5,  10,  10,   5,   5, -10,
        -10,   0,   5,  10,  10,   5,   0, -10,
        -10,   0,   0,   0,   0,   0,   0, -10,
        -20, -10, -10, -10, -10, -10, -10, -20,
    ],
    chess.ROOK: [
          0,   0,   0,   5,   5,   0,   0,   0,
         -5,   0,   0,   0,   0,   0,   0,  -5,
         -5,   0,   0,   0,   0,   0,   0,  -5,
         -5,   0,   0,   0,   0,   0,   0,  -5,
         -5,   0,   0,   0,   0,   0,   0,  -5,
         -5,   0,   0,   0,   0,   0,   0,  -5,
          5,  10,  10,  10,  10,  10,  10,   5,
          0,   0,   0,   0,   0,   0,   0,   0,
    ],
    chess.QUEEN: [
        -20, -10, -10,  -5,  -5, -10, -10, -20,
        -10,   0,   5,   0,   0,   0,   0, -10,
        -10,   5,   5,   5,   5,   5,   0, -10,
          0,   0,   5,   5,   5,   5,   0,  -5,
         -5,   0,   5,   5,   5,   5,   0,  -5,
        -10,   0,   5,   5,   5,   5,   0, -10,
        -10,   0,   0,   0,   0,   0,   0, -10,
        -20, -10, -10,  -5,  -5, -10, -10, -20,
    ],
    chess.KING: [
         20,  30,  10,   0,   0,  10,  30,  20,
         20,  20,   0,   0,   0,   0,  20,  20,
        -10, -20, -20, -20, -20, -20, -20, -10,
        -20, -30, -30, -40, -40, -30, -30, -20,
        -30, -40, -40, -50, -50, -40, -40, -30,
        -30, -40, -40, -50, -50, -40, -40, -30,
        -30, -40, -40, -50, -50, -40, -40, -30,
        -30, -40, -40, -50, -50, -40, -40, -30,
    ],
}

PIECE_ORDER = [chess.PAWN, chess.KNIGHT, chess.BISHOP, chess.ROOK, chess.QUEEN]
ALL_PIECES = PIECE_ORDER + [chess.KING]

FEATURE_NAMES = (
    [f"mat_{chess.piece_name(p)}" for p in PIECE_ORDER]
    + [f"pst_{chess.piece_name(p)}" for p in ALL_PIECES]
    + ["side_to_move"]
)
NUM_FEATURES = len(FEATURE_NAMES)  # 12


def board_features(board: chess.Board) -> list[float]:
    """Bir python-chess Board nesnesinden ozellik vektoru uretir (beyaz perspektifi)."""
    material = {p: 0 for p in PIECE_ORDER}
    pst = {p: 0 for p in ALL_PIECES}

    for square, piece in board.piece_map().items():
        ptype = piece.piece_type
        if piece.color == chess.WHITE:
            sq = square
            sign = 1
        else:
            # Siyah taslar icin tabloyu dikey aynala (a1<->a8 vb.)
            sq = chess.square_mirror(square)
            sign = -1

        if ptype in material:
            material[ptype] += sign
        pst[ptype] += sign * PST[ptype][sq]

    feats = [float(material[p]) for p in PIECE_ORDER]
    feats += [pst[p] / 100.0 for p in ALL_PIECES]
    feats.append(1.0 if board.turn == chess.WHITE else -1.0)
    return feats
