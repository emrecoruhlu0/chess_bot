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
  const QUEEN_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];

  function onBoard(f, r) {
    return f >= 0 && f < 8 && r >= 0 && r < 8;
  }

  // grid (Int8Array): 0=bos, dolu kare icin sifirdan farkli (isaret = renk).
  // Kayan tasin ulasabilecegi kare sayisi; ilk dolu karede durur (alis sayilir).
  function slideCount(grid, f, r, dirs) {
    let cnt = 0;
    for (let d = 0; d < dirs.length; d++) {
      const df = dirs[d][0], dr = dirs[d][1];
      let nf = f + df, nr = r + dr;
      while (onBoard(nf, nr)) {
        cnt += 1;
        if (grid[nr * 8 + nf] !== 0) break;
        nf += df; nr += dr;
      }
    }
    return cnt;
  }

  // grid[r*8+f] uzerindeki (piyon disi) tas, (tf,tr) hedefini pseudo-saldiriyor mu?
  // pieceCode: tipin mutlak kodu (2=n,3=b,4=r,5=q,6=k).
  function attacksTarget(grid, f, r, tf, tr, pieceCode) {
    if (pieceCode === 2) { // at
      for (let k = 0; k < KNIGHT_DELTAS.length; k++) {
        if (f + KNIGHT_DELTAS[k][0] === tf && r + KNIGHT_DELTAS[k][1] === tr) return true;
      }
      return false;
    }
    if (pieceCode === 6) { // sah
      for (let k = 0; k < KING_DELTAS.length; k++) {
        if (f + KING_DELTAS[k][0] === tf && r + KING_DELTAS[k][1] === tr) return true;
      }
      return false;
    }
    let dirs;
    if (pieceCode === 3) dirs = BISHOP_DIRS;
    else if (pieceCode === 4) dirs = ROOK_DIRS;
    else if (pieceCode === 5) dirs = QUEEN_DIRS;
    else return false;
    for (let d = 0; d < dirs.length; d++) {
      const df = dirs[d][0], dr = dirs[d][1];
      let nf = f + df, nr = r + dr;
      while (onBoard(nf, nr)) {
        if (nf === tf && nr === tr) return true;
        if (grid[nr * 8 + nf] !== 0) break;
        nf += df; nr += dr;
      }
    }
    return false;
  }

  // Tip harfi -> mutlak kod.
  const TYPE_CODE = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };

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
    // grid (Int8Array): 0=bos; dolu kare = +kod (beyaz) / -kod (siyah).
    // kod: p=1,n=2,b=3,r=4,q=5,k=6. sq = rank*8 + file.
    const grid = new Int8Array(64);

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
        const code = TYPE_CODE[type];
        grid[square] = isWhite ? code : -code;

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
    // (Mantik features.py ile birebir; burada sadece allocation/closure azaltarak
    //  hizlandirilmistir, sonuc degismez.)
    let mobP = 0, mobN = 0, mobB = 0, mobR = 0, mobQ = 0; // beyaz - siyah
    const wpFile = [0, 0, 0, 0, 0, 0, 0, 0];
    const bpFile = [0, 0, 0, 0, 0, 0, 0, 0];
    let whiteKingSq = -1, blackKingSq = -1;
    // Piyon ve kale karelerini duz dizilerde tut (kare indeksi).
    const whitePawnSq = [], blackPawnSq = [];
    const whiteRooksFile = [], blackRooksFile = [];

    for (let sq = 0; sq < 64; sq++) {
      const v = grid[sq];
      if (v === 0) continue;
      const isWhite = v > 0;
      const code = isWhite ? v : -v; // mutlak tip kodu
      const f = sq & 7, r = sq >> 3;
      const sign = isWhite ? 1 : -1;

      if (code === 1) { // piyon
        const pr = isWhite ? r + 1 : r - 1;
        let cnt = 0;
        if (onBoard(f - 1, pr)) cnt += 1;
        if (onBoard(f + 1, pr)) cnt += 1;
        mobP += sign * cnt;
        if (isWhite) { wpFile[f] += 1; whitePawnSq.push(sq); }
        else { bpFile[f] += 1; blackPawnSq.push(sq); }
      } else if (code === 2) { // at
        let cnt = 0;
        for (let k = 0; k < KNIGHT_DELTAS.length; k++) {
          if (onBoard(f + KNIGHT_DELTAS[k][0], r + KNIGHT_DELTAS[k][1])) cnt += 1;
        }
        mobN += sign * cnt;
      } else if (code === 3) { // fil
        mobB += sign * slideCount(grid, f, r, BISHOP_DIRS);
      } else if (code === 4) { // kale
        mobR += sign * slideCount(grid, f, r, ROOK_DIRS);
        (isWhite ? whiteRooksFile : blackRooksFile).push(f);
      } else if (code === 5) { // vezir
        mobQ += sign * slideCount(grid, f, r, QUEEN_DIRS);
      } else if (code === 6) { // sah
        if (isWhite) whiteKingSq = sq; else blackKingSq = sq;
      }
    }

    feats.push(mobP, mobN, mobB, mobR, mobQ);

    // Doubled
    let wDoubled = 0, bDoubled = 0;
    for (let f = 0; f < 8; f++) {
      if (wpFile[f] >= 2) wDoubled += wpFile[f];
      if (bpFile[f] >= 2) bDoubled += bpFile[f];
    }
    feats.push(wDoubled - bDoubled);

    // Isolated
    feats.push(isolatedCount(wpFile) - isolatedCount(bpFile));

    // Passed
    let wPassed = 0;
    for (let i = 0; i < whitePawnSq.length; i++) {
      const sq = whitePawnSq[i], f = sq & 7, r = sq >> 3;
      let blocked = false;
      for (let ef = f - 1; ef <= f + 1 && !blocked; ef++) {
        if (ef < 0 || ef > 7 || bpFile[ef] === 0) continue;
        for (let j = 0; j < blackPawnSq.length; j++) {
          const bsq = blackPawnSq[j];
          if ((bsq & 7) === ef && (bsq >> 3) > r) { blocked = true; break; }
        }
      }
      if (!blocked) wPassed += 1;
    }
    let bPassed = 0;
    for (let i = 0; i < blackPawnSq.length; i++) {
      const sq = blackPawnSq[i], f = sq & 7, r = sq >> 3;
      let blocked = false;
      for (let ef = f - 1; ef <= f + 1 && !blocked; ef++) {
        if (ef < 0 || ef > 7 || wpFile[ef] === 0) continue;
        for (let j = 0; j < whitePawnSq.length; j++) {
          const wsq = whitePawnSq[j];
          if ((wsq & 7) === ef && (wsq >> 3) < r) { blocked = true; break; }
        }
      }
      if (!blocked) bPassed += 1;
    }
    feats.push(wPassed - bPassed);

    // King shield
    feats.push(shieldCount(grid, whiteKingSq, 1) - shieldCount(grid, blackKingSq, -1));

    // King attackers (pozitif = beyaz lehine: siyah sahina daha cok saldiri)
    const atkOnWhite = countAttackers(grid, whiteKingSq, false);
    const atkOnBlack = countAttackers(grid, blackKingSq, true);
    feats.push(atkOnBlack - atkOnWhite);

    // Open-file rook
    let wOpen = 0, bOpen = 0;
    for (let i = 0; i < whiteRooksFile.length; i++) if (wpFile[whiteRooksFile[i]] === 0) wOpen += 1;
    for (let i = 0; i < blackRooksFile.length; i++) if (bpFile[blackRooksFile[i]] === 0) bOpen += 1;
    feats.push(wOpen - bOpen);

    return feats;
  }

  // Izole piyon sayisi (komsu dosyalarda dost piyon yok).
  function isolatedCount(files) {
    let n = 0;
    for (let f = 0; f < 8; f++) {
      if (files[f] === 0) continue;
      const left = f - 1 >= 0 ? files[f - 1] : 0;
      const right = f + 1 <= 7 ? files[f + 1] : 0;
      if (left === 0 && right === 0) n += files[f];
    }
    return n;
  }

  // Sahin onundeki 3 dosya x 2 sira dost piyon sayisi. forward: beyaz +1, siyah -1.
  function shieldCount(grid, kingSq, forward) {
    if (kingSq < 0) return 0;
    const kf = kingSq & 7, kr = kingSq >> 3;
    const friendlyPawn = forward > 0 ? 1 : -1; // beyaz piyon=+1, siyah piyon=-1
    let n = 0;
    for (let df = -1; df <= 1; df++) {
      for (let dd = 1; dd <= 2; dd++) {
        const nf = kf + df, nr = kr + dd * forward;
        if (!onBoard(nf, nr)) continue;
        if (grid[nr * 8 + nf] === friendlyPawn) n += 1;
      }
    }
    return n;
  }

  // Sahin 3x3 bolgesine saldiran dusman tas sayisi.
  function countAttackers(grid, kingSq, attackerIsWhite) {
    if (kingSq < 0) return 0;
    const kf = kingSq & 7, kr = kingSq >> 3;
    let n = 0;
    for (let sq = 0; sq < 64; sq++) {
      const v = grid[sq];
      if (v === 0 || (v > 0) !== attackerIsWhite) continue;
      const code = v > 0 ? v : -v, f = sq & 7, r = sq >> 3;
      let hits = false;
      if (code === 1) { // piyon
        const pr = attackerIsWhite ? r + 1 : r - 1;
        for (let df = -1; df <= 1 && !hits; df++) {
          for (let dr = -1; dr <= 1; dr++) {
            const tf = kf + df, tr = kr + dr;
            if (!onBoard(tf, tr)) continue;
            if (tr === pr && (tf === f - 1 || tf === f + 1)) { hits = true; break; }
          }
        }
      } else {
        for (let df = -1; df <= 1 && !hits; df++) {
          for (let dr = -1; dr <= 1; dr++) {
            const tf = kf + df, tr = kr + dr;
            if (!onBoard(tf, tr)) continue;
            if (attacksTarget(grid, f, r, tf, tr, code)) { hits = true; break; }
          }
        }
      }
      if (hits) n += 1;
    }
    return n;
  }

export { featuresFromFen, FEATURE_NAMES, PST };
