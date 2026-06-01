/*
 * Pozisyondan sayisal ozellik cikarimi (JS tarafi).
 *
 * ONEMLI: Bu dosya training/features.py ile BIREBIR ayni sayilari uretmek
 * zorundadir. PST tablolari, kare numaralandirmasi (a1=0..h8=63) ve ozellik
 * sirasi python-chess ile ayni tutulmustur. Degisiklikte iki tarafi da
 * guncelle ve verify_parity.js ile dogrula.
 *
 * Girdi: FEN string (chess.js'ten .fen() ile alinir).
 * Cikti: 23 elemanli ozellik dizisi (beyaz perspektifi).
 *
 * PARITY KORUMASI: Yeni ozellikler chess.js hamle uretimi (moves/attackers)
 * KULLANMAZ; FEN tahtasindan kurulan grid[64] uzerinde, features.py ile ayni
 * offset tablolari ve ayni pseudo-legal saldiri ureteci ile hesaplanir.
 * En passant ve rok ozelliklere DAHIL EDILMEZ.
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
    "mob_pawn", "mob_knight", "mob_bishop", "mob_rook", "mob_queen",
    "pawn_doubled", "pawn_isolated", "pawn_passed",
    "king_shield", "king_attackers", "open_file_rook",
  ];

  // Siyah icin dikey aynalama: square_mirror -> sq ^ 56 (rank'i ters cevirir).
  function mirror(sq) {
    return sq ^ 56;
  }

  // --- Pseudo-legal saldiri ureteci (features.py ile BIREBIR ayni siralama) ---
  // Kare: sq = rank*8 + file. file = sq % 8, rank = (sq - file) / 8.
  const KNIGHT_DELTAS = [[1, 2], [2, 1], [2, -1], [1, -2],
                         [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const KING_DELTAS = [[1, 0], [1, 1], [0, 1], [-1, 1],
                       [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function onBoard(f, r) {
    return f >= 0 && f < 8 && r >= 0 && r < 8;
  }

  // Kayan tasin ulasabilecegi kare sayisi; ilk dolu karede durur (alis sayilir).
  function slideCount(grid, f, r, dirs) {
    let cnt = 0;
    for (const [df, dr] of dirs) {
      let nf = f + df, nr = r + dr;
      while (onBoard(nf, nr)) {
        cnt += 1;
        if (grid[nr * 8 + nf] !== null) break;
        nf += df; nr += dr;
      }
    }
    return cnt;
  }

  // grid[r*8+f] uzerindeki (piyon disi) tas, targetSq'yi pseudo-saldiriyor mu?
  function attacksSquare(grid, f, r, targetSq, type) {
    const tf = targetSq % 8, tr = (targetSq - tf) / 8;
    if (type === "n") {
      for (const [df, dr] of KNIGHT_DELTAS) {
        if (f + df === tf && r + dr === tr) return true;
      }
      return false;
    }
    if (type === "k") {
      for (const [df, dr] of KING_DELTAS) {
        if (f + df === tf && r + dr === tr) return true;
      }
      return false;
    }
    let dirs;
    if (type === "b") dirs = BISHOP_DIRS;
    else if (type === "r") dirs = ROOK_DIRS;
    else if (type === "q") dirs = BISHOP_DIRS.concat(ROOK_DIRS);
    else return false;
    for (const [df, dr] of dirs) {
      let nf = f + df, nr = r + dr;
      while (onBoard(nf, nr)) {
        if (nf === tf && nr === tr) return true;
        if (grid[nr * 8 + nf] !== null) break;
        nf += df; nr += dr;
      }
    }
    return false;
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
    // grid[sq] = { type, isWhite } ya da null. sq = rank*8 + file.
    const grid = new Array(64).fill(null);

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
        grid[square] = { type, isWhite };

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

    // --- Yeni ozellikler: grid uzerinde, chess.js hamle uretimi olmadan ---
    const mob = { p: 0, n: 0, b: 0, r: 0, q: 0 }; // beyaz - siyah (isaretli)
    const wpFile = [0, 0, 0, 0, 0, 0, 0, 0];
    const bpFile = [0, 0, 0, 0, 0, 0, 0, 0];
    let whiteKing = null, blackKing = null;
    const whitePawns = [], blackPawns = []; // [file, rank]
    const whiteRooksFile = [], blackRooksFile = [];

    for (let sq = 0; sq < 64; sq++) {
      const cell = grid[sq];
      if (cell === null) continue;
      const type = cell.type, isWhite = cell.isWhite;
      const f = sq % 8, r = (sq - f) / 8;
      const sign = isWhite ? 1 : -1;

      if (type === "p") {
        const pr = isWhite ? r + 1 : r - 1;
        let cnt = 0;
        if (onBoard(f - 1, pr)) cnt += 1;
        if (onBoard(f + 1, pr)) cnt += 1;
        mob.p += sign * cnt;
        if (isWhite) { wpFile[f] += 1; whitePawns.push([f, r]); }
        else { bpFile[f] += 1; blackPawns.push([f, r]); }
      } else if (type === "n") {
        let cnt = 0;
        for (const [df, dr] of KNIGHT_DELTAS) if (onBoard(f + df, r + dr)) cnt += 1;
        mob.n += sign * cnt;
      } else if (type === "b") {
        mob.b += sign * slideCount(grid, f, r, BISHOP_DIRS);
      } else if (type === "r") {
        mob.r += sign * slideCount(grid, f, r, ROOK_DIRS);
        (isWhite ? whiteRooksFile : blackRooksFile).push(f);
      } else if (type === "q") {
        mob.q += sign * slideCount(grid, f, r, BISHOP_DIRS.concat(ROOK_DIRS));
      } else if (type === "k") {
        if (isWhite) whiteKing = [f, r]; else blackKing = [f, r];
      }
    }

    for (const p of MATERIAL_PIECES) feats.push(mob[p]);

    // Doubled
    let wDoubled = 0, bDoubled = 0;
    for (let f = 0; f < 8; f++) {
      if (wpFile[f] >= 2) wDoubled += wpFile[f];
      if (bpFile[f] >= 2) bDoubled += bpFile[f];
    }
    feats.push(wDoubled - bDoubled);

    // Isolated
    function isolated(files) {
      let n = 0;
      for (let f = 0; f < 8; f++) {
        if (files[f] === 0) continue;
        const left = f - 1 >= 0 ? files[f - 1] : 0;
        const right = f + 1 <= 7 ? files[f + 1] : 0;
        if (left === 0 && right === 0) n += files[f];
      }
      return n;
    }
    feats.push(isolated(wpFile) - isolated(bpFile));

    // Passed
    let wPassed = 0;
    for (const [f, r] of whitePawns) {
      let blocked = false;
      for (const ef of [f - 1, f, f + 1]) {
        if (ef >= 0 && ef <= 7 && bpFile[ef] > 0) {
          for (const [bf, br] of blackPawns) {
            if (bf === ef && br > r) { blocked = true; break; }
          }
        }
        if (blocked) break;
      }
      if (!blocked) wPassed += 1;
    }
    let bPassed = 0;
    for (const [f, r] of blackPawns) {
      let blocked = false;
      for (const ef of [f - 1, f, f + 1]) {
        if (ef >= 0 && ef <= 7 && wpFile[ef] > 0) {
          for (const [wf, wr] of whitePawns) {
            if (wf === ef && wr < r) { blocked = true; break; }
          }
        }
        if (blocked) break;
      }
      if (!blocked) bPassed += 1;
    }
    feats.push(wPassed - bPassed);

    // King shield
    function shield(king, pawnSet, forward) {
      if (king === null) return 0;
      const kf = king[0], kr = king[1];
      let n = 0;
      for (const df of [-1, 0, 1]) {
        for (const dr of [1, 2]) {
          const nf = kf + df, nr = kr + dr * forward;
          if (onBoard(nf, nr) && pawnSet.has(nr * 8 + nf)) n += 1;
        }
      }
      return n;
    }
    const whitePawnSet = new Set(whitePawns.map(([f, r]) => r * 8 + f));
    const blackPawnSet = new Set(blackPawns.map(([f, r]) => r * 8 + f));
    feats.push(shield(whiteKing, whitePawnSet, 1) - shield(blackKing, blackPawnSet, -1));

    // King attackers
    function zone(king) {
      if (king === null) return [];
      const kf = king[0], kr = king[1];
      const z = [];
      for (const df of [-1, 0, 1]) {
        for (const dr of [-1, 0, 1]) {
          if (onBoard(kf + df, kr + dr)) z.push((kr + dr) * 8 + (kf + df));
        }
      }
      return z;
    }
    function countAttackers(z, attackerIsWhite) {
      if (z.length === 0) return 0;
      let n = 0;
      for (let sq = 0; sq < 64; sq++) {
        const cell = grid[sq];
        if (cell === null) continue;
        const type = cell.type, isWhite = cell.isWhite;
        if (isWhite !== attackerIsWhite) continue;
        const f = sq % 8, r = (sq - f) / 8;
        let hits = false;
        if (type === "p") {
          const pr = isWhite ? r + 1 : r - 1;
          for (const tsq of z) {
            const tf = tsq % 8, tr = (tsq - tf) / 8;
            if (tr === pr && (tf === f - 1 || tf === f + 1)) { hits = true; break; }
          }
        } else {
          for (const tsq of z) {
            if (attacksSquare(grid, f, r, tsq, type)) { hits = true; break; }
          }
        }
        if (hits) n += 1;
      }
      return n;
    }
    const atkOnWhite = countAttackers(zone(whiteKing), false);
    const atkOnBlack = countAttackers(zone(blackKing), true);
    feats.push(atkOnBlack - atkOnWhite);

    // Open-file rook
    let wOpen = 0, bOpen = 0;
    for (const f of whiteRooksFile) if (wpFile[f] === 0) wOpen += 1;
    for (const f of blackRooksFile) if (bpFile[f] === 0) bOpen += 1;
    feats.push(wOpen - bOpen);

    return feats;
  }

export { featuresFromFen, FEATURE_NAMES, PST };
