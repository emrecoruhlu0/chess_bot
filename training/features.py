"""
Pozisyondan sayisal ozellik cikarimi (Python tarafi).

ONEMLI: Bu dosyadaki mantik, web/features.js ile BIREBIR ayni sayilari
uretmek zorundadir. Birinde degisiklik yaparsan digerini de guncelle ve
web/verify_parity.js ile dogrula (parity_cases.json uzerinden).

Tum ozellikler BEYAZ perspektifinden hesaplanir.
Ozellik vektoru (toplam 23 boyut):
  [0..4]   materyal farki: (beyaz - siyah) adet -> P, N, B, R, Q
  [5..10]  piece-square tablo skoru / 100: P, N, B, R, Q, K
  [11]     sira: beyaz oynayacaksa +1, siyah oynayacaksa -1
  [12..16] mobility farki (beyaz - siyah): pseudo-legal hamle sayisi P,N,B,R,Q
  [17]     pawn_doubled  (beyaz - siyah ikili piyon sayisi)
  [18]     pawn_isolated (beyaz - siyah izole piyon sayisi)
  [19]     pawn_passed   (beyaz - siyah gecer piyon sayisi)
  [20]     king_shield   (beyaz - siyah sah onu dost piyon sayisi)
  [21]     king_attackers (siyah sahina saldiran - beyaz sahina saldiran)
  [22]     open_file_rook (beyaz - siyah yari-acik dosyadaki kale sayisi)

PARITY KORUMASI: Yeni ozellikler kutuphane hamle uretimi (board.legal_moves,
board.attacks, board.attackers) KULLANMAZ. Bunun yerine FEN tahtasindan kurulan
grid[64] uzerinde, asagidaki elle yazilmis pseudo-legal saldiri ureteci ile
hesaplanir. Ayni offset tablolari web/features.js icinde de ayni sirada yer alir.
Boylece python-chess ile chess.js arasindaki hamle uretimi farklari parity'yi
bozamaz. En passant ve rok ozelliklere DAHIL EDILMEZ.
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
    + [f"mob_{chess.piece_name(p)}" for p in PIECE_ORDER]
    + ["pawn_doubled", "pawn_isolated", "pawn_passed"]
    + ["king_shield", "king_attackers", "open_file_rook"]
)
NUM_FEATURES = len(FEATURE_NAMES)  # 23

# --- Pseudo-legal saldiri ureteci icin offset tablolari ---
# Kare indeksi: sq = rank*8 + file (a1=0..h8=63). file = sq % 8, rank = sq // 8.
# At hamleleri: (df, dr) ciftleri.
KNIGHT_DELTAS = [(1, 2), (2, 1), (2, -1), (1, -2),
                 (-1, -2), (-2, -1), (-2, 1), (-1, 2)]
# Sah (3x3 komsuluk) hamleleri.
KING_DELTAS = [(1, 0), (1, 1), (0, 1), (-1, 1),
               (-1, 0), (-1, -1), (0, -1), (1, -1)]
# Kayan taslarin yon vektorleri.
BISHOP_DIRS = [(1, 1), (1, -1), (-1, 1), (-1, -1)]
ROOK_DIRS = [(1, 0), (-1, 0), (0, 1), (0, -1)]


def _on_board(f: int, r: int) -> bool:
    return 0 <= f < 8 and 0 <= r < 8


def _slide_count(grid, f: int, r: int, dirs) -> int:
    """Kayan tasin (fil/kale/vezir) ulasabilecegi kare sayisi; ilk dolu karede
    durur (o kareyi sayar = alis). Sahta birakma/pin kontrolu YOK."""
    cnt = 0
    for df, dr in dirs:
        nf, nr = f + df, r + dr
        while _on_board(nf, nr):
            cnt += 1
            if grid[nr * 8 + nf] is not None:
                break  # dolu kare: alis say, sonra dur
            nf += df
            nr += dr
    return cnt


def _attacks_square(grid, f: int, r: int, target_sq: int, ptype: int) -> bool:
    """grid[r*8+f] uzerindeki ptype tasi target_sq'yi pseudo-saldiriyor mu?
    Piyon icin renk gerektigi icindem _attacks_square piyon disi taslar icindir."""
    tf, tr = target_sq % 8, target_sq // 8
    if ptype == chess.KNIGHT:
        for df, dr in KNIGHT_DELTAS:
            if f + df == tf and r + dr == tr:
                return True
        return False
    if ptype == chess.KING:
        for df, dr in KING_DELTAS:
            if f + df == tf and r + dr == tr:
                return True
        return False
    # Kayan taslar: hedefe dogru ray izle, arada engel var mi bak.
    if ptype == chess.BISHOP:
        dirs = BISHOP_DIRS
    elif ptype == chess.ROOK:
        dirs = ROOK_DIRS
    elif ptype == chess.QUEEN:
        dirs = BISHOP_DIRS + ROOK_DIRS
    else:
        return False
    for df, dr in dirs:
        nf, nr = f + df, r + dr
        while _on_board(nf, nr):
            if nf == tf and nr == tr:
                return True
            if grid[nr * 8 + nf] is not None:
                break
            nf += df
            nr += dr
    return False


def board_features(board: chess.Board) -> list[float]:
    """Bir python-chess Board nesnesinden ozellik vektoru uretir (beyaz perspektifi)."""
    material = {p: 0 for p in PIECE_ORDER}
    pst = {p: 0 for p in ALL_PIECES}

    # grid[sq] = (piece_type, is_white) ya da None. sq = rank*8 + file.
    grid = [None] * 64
    for square, piece in board.piece_map().items():
        ptype = piece.piece_type
        is_white = piece.color == chess.WHITE
        grid[square] = (ptype, is_white)
        if is_white:
            sq = square
            sign = 1
        else:
            sq = chess.square_mirror(square)  # siyah icin tabloyu dikey aynala
            sign = -1
        if ptype in material:
            material[ptype] += sign
        pst[ptype] += sign * PST[ptype][sq]

    feats = [float(material[p]) for p in PIECE_ORDER]
    feats += [pst[p] / 100.0 for p in ALL_PIECES]
    feats.append(1.0 if board.turn == chess.WHITE else -1.0)

    # --- Yeni ozellikler: grid uzerinde, kutuphane hamle uretimi olmadan ---
    mob = {p: 0 for p in PIECE_ORDER}  # beyaz - siyah, isaretli toplanir
    # Piyon dosya sayimlari (passed/doubled/isolated icin).
    wp_file = [0] * 8
    bp_file = [0] * 8
    white_king = None
    black_king = None
    white_pawns = []  # (file, rank)
    black_pawns = []
    white_rooks_file = []
    black_rooks_file = []

    for sq in range(64):
        cell = grid[sq]
        if cell is None:
            continue
        ptype, is_white = cell
        f, r = sq % 8, sq // 8
        sign = 1 if is_white else -1

        if ptype == chess.PAWN:
            # Piyon mobility = ileri-capraz iki hedef karenin tahta-ici sayisi.
            pr = r + 1 if is_white else r - 1
            cnt = 0
            if _on_board(f - 1, pr):
                cnt += 1
            if _on_board(f + 1, pr):
                cnt += 1
            mob[chess.PAWN] += sign * cnt
            if is_white:
                wp_file[f] += 1
                white_pawns.append((f, r))
            else:
                bp_file[f] += 1
                black_pawns.append((f, r))
        elif ptype == chess.KNIGHT:
            cnt = sum(1 for df, dr in KNIGHT_DELTAS if _on_board(f + df, r + dr))
            mob[chess.KNIGHT] += sign * cnt
        elif ptype == chess.BISHOP:
            mob[chess.BISHOP] += sign * _slide_count(grid, f, r, BISHOP_DIRS)
        elif ptype == chess.ROOK:
            mob[chess.ROOK] += sign * _slide_count(grid, f, r, ROOK_DIRS)
            (white_rooks_file if is_white else black_rooks_file).append(f)
        elif ptype == chess.QUEEN:
            mob[chess.QUEEN] += sign * _slide_count(grid, f, r, BISHOP_DIRS + ROOK_DIRS)
        elif ptype == chess.KING:
            if is_white:
                white_king = (f, r)
            else:
                black_king = (f, r)

    for p in PIECE_ORDER:
        feats.append(float(mob[p]))

    # Doubled: bir dosyada >=2 piyon varsa o dosyadaki tum piyonlari say.
    w_doubled = sum(c for c in wp_file if c >= 2)
    b_doubled = sum(c for c in bp_file if c >= 2)
    feats.append(float(w_doubled - b_doubled))

    # Isolated: komsu dosyalarda (f-1, f+1) hic dost piyon yoksa piyon izoledir.
    def _isolated(files):
        n = 0
        for f in range(8):
            if files[f] == 0:
                continue
            left = files[f - 1] if f - 1 >= 0 else 0
            right = files[f + 1] if f + 1 <= 7 else 0
            if left == 0 and right == 0:
                n += files[f]
        return n
    feats.append(float(_isolated(wp_file) - _isolated(bp_file)))

    # Passed: rakip piyon yok f-1,f,f+1 dosyalarinda, piyonun onunde.
    w_passed = 0
    for f, r in white_pawns:
        blocked = False
        for ef in (f - 1, f, f + 1):
            if 0 <= ef <= 7 and bp_file[ef] > 0:
                for bf, br in black_pawns:
                    if bf == ef and br > r:
                        blocked = True
                        break
            if blocked:
                break
        if not blocked:
            w_passed += 1
    b_passed = 0
    for f, r in black_pawns:
        blocked = False
        for ef in (f - 1, f, f + 1):
            if 0 <= ef <= 7 and wp_file[ef] > 0:
                for wf, wr in white_pawns:
                    if wf == ef and wr < r:
                        blocked = True
                        break
            if blocked:
                break
        if not blocked:
            b_passed += 1
    feats.append(float(w_passed - b_passed))

    # King shield: sahin onundeki 3 dosya x 2 sira dost piyon sayisi.
    def _shield(king, pawn_files_set, forward):
        if king is None:
            return 0
        kf, kr = king
        n = 0
        for df in (-1, 0, 1):
            for dr in (1, 2):
                nf = kf + df
                nr = kr + dr * forward
                if _on_board(nf, nr) and (nf, nr) in pawn_files_set:
                    n += 1
        return n
    white_pawn_set = set(white_pawns)
    black_pawn_set = set(black_pawns)
    feats.append(float(_shield(white_king, white_pawn_set, 1)
                       - _shield(black_king, black_pawn_set, -1)))

    # King attackers: sahin 3x3 bolgesine saldiran dusman tas sayisi.
    def _zone(king):
        if king is None:
            return []
        kf, kr = king
        zone = []
        for df in (-1, 0, 1):
            for dr in (-1, 0, 1):
                if _on_board(kf + df, kr + dr):
                    zone.append((kr + dr) * 8 + (kf + df))
        return zone

    def _count_attackers(zone, attacker_is_white):
        if not zone:
            return 0
        n = 0
        for sq in range(64):
            cell = grid[sq]
            if cell is None:
                continue
            ptype, is_white = cell
            if is_white != attacker_is_white:
                continue
            f, r = sq % 8, sq // 8
            hits = False
            if ptype == chess.PAWN:
                pr = r + 1 if is_white else r - 1
                for tsq in zone:
                    tf, tr = tsq % 8, tsq // 8
                    if tr == pr and (tf == f - 1 or tf == f + 1):
                        hits = True
                        break
            else:
                for tsq in zone:
                    if _attacks_square(grid, f, r, tsq, ptype):
                        hits = True
                        break
            if hits:
                n += 1
        return n

    atk_on_white = _count_attackers(_zone(white_king), attacker_is_white=False)
    atk_on_black = _count_attackers(_zone(black_king), attacker_is_white=True)
    # Pozitif = beyaz lehine (siyah sahina daha cok saldiri).
    feats.append(float(atk_on_black - atk_on_white))

    # Open-file rook: dost piyonu olmayan dosyadaki kale (yari-acik).
    w_open = sum(1 for f in white_rooks_file if wp_file[f] == 0)
    b_open = sum(1 for f in black_rooks_file if bp_file[f] == 0)
    feats.append(float(w_open - b_open))

    return feats
