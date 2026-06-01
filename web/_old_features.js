/*
 * Pozisyondan sayisal ozellik cikarimi (JS tarafi).
 *
 * ONEMLI: Bu dosya training/features.py ile BIREBIR ayni sayilari uretmek
 * zorundadir. PST tablolari, kare numaralandirmasi (a1=0..h8=63) ve ozellik
 * sirasi python-chess ile ayni tutulmustur. Degisiklikte iki tarafi da
 * guncelle ve training/verify_parity ile dogrula.
 *
 * Girdi: FEN string (chess.js'ten .fen() ile alinir).
 * Cikti: 12 elemanli ozellik dizisi (beyaz perspektifi).
 *
 * ES modulu olarak hem tarayicida (import) hem Node'da (import) calisir.
 */
"use strict";

  // python-chess kare indeksi: square = rank*8 + file, a1=0, b1=1, ... h8=63.
  // PST tablolari da bu indekslemeye gore (Tomasz Michniewski "simplified eval").
  const PST = {
    p: [
        0,   0,   0,   0,   0,   0,   0,   0,
        5,  10,  10, -20, -20,  10,  10,   5,
        5,  -5, -10,   0,   0, -10,  -5,   5,
        0,   0,   0,  20,  20,   0,   0,   0,
        5,   5,  10,  25,  25,  10,   5,   5,
       10,  10,  20,  30,  30,  20,  10,  10,
       50,  50,  50,  50,  50,  50,  50,  50,
        0,   0,   0,   0,   0,   0,   0,   0,
    ],
    n: [
      -50, -40, -30, -30, -30, -30, -40, -50,
      -40, -20,   0,   5,   5,   0, -20, -40,
      -30,   5,  10,  15,  15,  10,   5, -30,
      -30,   0,  15,  20,  20,  15,   0, -30,
      -30,   5,  15,  20,  20,  15,   5, -30,
      -30,   0,  10,  15,  15,  10,   0, -30,
      -40, -20,   0,   0,   0,   0, -20, -40,
      -50, -40, -30, -30, -30, -30, -40, -50,
    ],
    b: [
      -20, -10, -10, -10, -10, -10, -10, -20,
      -10,   5,   0,   0,   0,   0,   5, -10,
      -10,  10,  10,  10,  10,  10,  10, -10,
      -10,   0,  10,  10,  10,  10,   0, -10,
      -10,   5,   5,  10,  10,   5,   5, -10,
      -10,   0,   5,  10,  10,   5,   0, -10,
      -10,   0,   0,   0,   0,   0,   0, -10,
      -20, -10, -10, -10, -10, -10, -10, -20,
    ],
    r: [
        0,   0,   0,   5,   5,   0,   0,   0,
       -5,   0,   0,   0,   0,   0,   0,  -5,
       -5,   0,   0,   0,   0,   0,   0,  -5,
       -5,   0,   0,   0,   0,   0,   0,  -5,
       -5,   0,   0,   0,   0,   0,   0,  -5,
       -5,   0,   0,   0,   0,   0,   0,  -5,
        5,  10,  10,  10,  10,  10,  10,   5,
        0,   0,   0,   0,   0,   0,   0,   0,
    ],
    q: [
      -20, -10, -10,  -5,  -5, -10, -10, -20,
      -10,   0,   5,   0,   0,   0,   0, -10,
      -10,   5,   5,   5,   5,   5,   0, -10,
        0,   0,   5,   5,   5,   5,   0,  -5,
       -5,   0,   5,   5,   5,   5,   0,  -5,
      -10,   0,   5,   5,   5,   5,   0, -10,
      -10,   0,   0,   0,   0,   0,   0, -10,
      -20, -10, -10,  -5,  -5, -10, -10, -20,
    ],
    k: [
       20,  30,  10,   0,   0,  10,  30,  20,
       20,  20,   0,   0,   0,   0,  20,  20,
      -10, -20, -20, -20, -20, -20, -20, -10,
      -20, -30, -30, -40, -40, -30, -30, -20,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
    ],
  };

  // Materyal ozelliklerinde kullanilan sira (vezirden once kale vb. python ile ayni)
  const MATERIAL_PIECES = ["p", "n", "b", "r", "q"];
  const ALL_PIECES = ["p", "n", "b", "r", "q", "k"];

  const FEATURE_NAMES = [
    "mat_pawn", "mat_knight", "mat_bishop", "mat_rook", "mat_queen",
    "pst_pawn", "pst_knight", "pst_bishop", "pst_rook", "pst_queen", "pst_king",
    "side_to_move",
  ];

  // Siyah icin dikey aynalama: square_mirror -> sq ^ 56 (rank'i ters cevirir).
  function mirror(sq) {
    return sq ^ 56;
  }

  /*
   * FEN'in tahta kismini gezerek (feature) vektoru uretir.
   * FEN tahta kismi 8. ranktan 1. ranka, her rank a->h dosyasiyla yazilir.
   */
  function featuresFromFen(fen) {
    const parts = fen.trim().split(/\s+/);
    const boardPart = parts[0];
    const sideToMove = parts[1]; // 'w' veya 'b'

    const material = { p: 0, n: 0, b: 0, r: 0, q: 0 };
    const pst = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };

    const ranks = boardPart.split("/"); // index 0 = rank 8, index 7 = rank 1
    for (let i = 0; i < 8; i++) {
      const rankStr = ranks[i];
      const rank = 7 - i; // FEN ilk satiri rank 8 -> rank index 7..0
      let file = 0;
      for (const ch of rankStr) {
        if (ch >= "1" && ch <= "8") {
          file += parseInt(ch, 10);
          continue;
        }
        const isWhite = ch === ch.toUpperCase();
        const type = ch.toLowerCase(); // p,n,b,r,q,k
        const square = rank * 8 + file; // a1=0 ... h8=63

        let sq, sign;
        if (isWhite) {
          sq = square;
          sign = 1;
        } else {
          sq = mirror(square);
          sign = -1;
        }

        if (type in material) {
          material[type] += sign;
        }
        pst[type] += sign * PST[type][sq];

        file += 1;
      }
    }

    const feats = [];
    for (const p of MATERIAL_PIECES) feats.push(material[p]);
    for (const p of ALL_PIECES) feats.push(pst[p] / 100.0);
    feats.push(sideToMove === "w" ? 1.0 : -1.0);
    return feats;
  }

export { featuresFromFen, FEATURE_NAMES, PST };
