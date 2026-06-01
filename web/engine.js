/*
 * Satranc botu arama motoru: minimax + alpha-beta + quiescence +
 * transposition table + iterative deepening.
 *
 * Yaprak pozisyonlar evaluate.js (ML modeli) ile skorlanir; skor "beyazin
 * kazanma olasiligi" (0..1) -> [-1,1]'e tasinir. Beyaz maksimize, siyah minimize.
 *
 * Iyilestirmeler:
 *  - Eval cache: ML degerlendirmesi (sicak yol) FEN'e gore Map'te onbelleklenir.
 *  - Quiescence: yaprakta sadece alis/terfi hamleleri derinlemesine aranir
 *    (taktiksel "bedava tas" korlugunu cozer).
 *  - Transposition table: ayni pozisyon (halfmove/fullmove atilmis FEN anahtari)
 *    farkli yoldan gelince sonucu yeniden hesaplanmaz; en iyi hamle siralamaya
 *    tohum yapilir.
 *  - Iterative deepening: derinlik 1..maxDepth kademeli; zaman butcesi dolunca
 *    son TAM biten derinligin hamlesi dondurulur.
 *
 * Disa baglilik enjekte edilir: bir evaluator (winProbWhite) ve Chess sinifi.
 */

// Mat skorlari (olasilik araliginin disinda, kesin sonuc).
export const MATE = 1000;

// TT giris bayraklari.
const EXACT = 0, LOWER = 1, UPPER = 2;

export function makeEngine(evaluator, Chess, opts) {
    opts = opts || {};
    const defaultDepth = opts.depth || opts.maxDepth || 3;
    const defaultTimeMs = opts.timeMs || 0; // 0 => zaman siniri yok (sabit derinlik)
    const QUIESCE_CAP = opts.quiesceCap != null ? opts.quiesceCap : 4; // quiescence ply ust siniri

    // --- Eval cache: FEN -> beyaz kazanma olasiligi [-1,1] ---
    const evalCache = new Map();
    function leafScore(game) {
      const key = game.fen();
      let v = evalCache.get(key);
      if (v === undefined) {
        v = (evaluator.winProbWhite(key) - 0.5) * 2; // 0..1 -> -1..1
        evalCache.set(key, v);
      }
      return v;
    }

    // --- Transposition table ---
    // anahtar = FEN'in son iki alani (halfmove/fullmove) atilmis hali, ki
    // transpozisyonlar gercekten cakissin.
    const tt = new Map();
    function ttKey(game) {
      const fen = game.fen();
      const sp = fen.split(" ");
      return sp[0] + " " + sp[1] + " " + sp[2] + " " + sp[3]; // tahta+sira+rok+ep
    }

    function terminalScore(game, ply) {
      if (game.isCheckmate()) {
        const whiteLost = game.turn() === "w";
        return whiteLost ? -MATE + ply : MATE - ply;
      }
      return 0; // pat / beraberlik -> notr
    }

    // Ucuz hamle siralamasi icin taş degerleri (MVV-LVA).
    const PIECE_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

    function moveOrderScore(m) {
      let s = 0;
      if (m.captured) s += 10 * PIECE_VAL[m.captured] - PIECE_VAL[m.piece]; // MVV-LVA
      if (m.promotion) s += 8 * (PIECE_VAL[m.promotion] || 9);
      if (m.san && m.san.includes("+")) s += 1; // sah
      return s;
    }

    /*
     * Hamle siralama: TT'deki en iyi hamleyi en one al, sonra MVV-LVA.
     */
    function orderedMoves(game, ttBest) {
      const moves = game.moves({ verbose: true });
      moves.sort((a, b) => moveOrderScore(b) - moveOrderScore(a));
      if (ttBest) {
        const idx = moves.findIndex(
          (m) => m.from === ttBest.from && m.to === ttBest.to && m.promotion === ttBest.promotion
        );
        if (idx > 0) {
          const [best] = moves.splice(idx, 1);
          moves.unshift(best);
        }
      }
      return moves;
    }

    /*
     * Quiescence: sadece alis ve terfi hamlelerini araclayarak "sessiz" bir
     * pozisyona inilene kadar derinlesir. Stand-pat = mevcut leafScore.
     */
    function quiesce(game, alpha, beta, ply, deadline, ctr) {
      checkTime(deadline, ctr);
      if (game.isGameOver()) return terminalScore(game, ply);

      const white = game.turn() === "w";
      const standPat = leafScore(game);

      if (white) {
        if (standPat >= beta) return standPat;
        if (standPat > alpha) alpha = standPat;
      } else {
        if (standPat <= alpha) return standPat;
        if (standPat < beta) beta = standPat;
      }
      if (ply >= QUIESCE_CAP) return standPat;

      // Sadece alis/terfi; ayrica acik sekilde kotu alislari (dusuk degerli
      // tasla yuksek degerli savunulan tasi degil, tersine kayipli alislari)
      // MVV-LVA skoru negatif olanlari ele -- quiescence patlamasini onler.
      const caps = game
        .moves({ verbose: true })
        .filter((m) => (m.captured || m.promotion) && moveOrderScore(m) >= 0)
        .sort((a, b) => moveOrderScore(b) - moveOrderScore(a));

      if (white) {
        let best = standPat;
        for (const m of caps) {
          game.move(m);
          const s = quiesce(game, alpha, beta, ply + 1, deadline, ctr);
          game.undo();
          if (s > best) best = s;
          if (best > alpha) alpha = best;
          if (alpha >= beta) break;
        }
        return best;
      } else {
        let best = standPat;
        for (const m of caps) {
          game.move(m);
          const s = quiesce(game, alpha, beta, ply + 1, deadline, ctr);
          game.undo();
          if (s < best) best = s;
          if (best < beta) beta = best;
          if (alpha >= beta) break;
        }
        return best;
      }
    }

    function alphabeta(game, depth, alpha, beta, ply, deadline, ctr) {
      checkTime(deadline, ctr);
      if (game.isGameOver()) return terminalScore(game, ply);
      if (depth === 0) return quiesce(game, alpha, beta, ply, deadline, ctr);

      const alphaOrig = alpha, betaOrig = beta;
      const key = ttKey(game);
      const entry = tt.get(key);
      let ttBest = null;
      if (entry) {
        ttBest = entry.bestMove;
        if (entry.depth >= depth) {
          if (entry.flag === EXACT) return entry.score;
          if (entry.flag === LOWER && entry.score > alpha) alpha = entry.score;
          else if (entry.flag === UPPER && entry.score < beta) beta = entry.score;
          if (alpha >= beta) return entry.score;
        }
      }

      const white = game.turn() === "w";
      const moves = orderedMoves(game, ttBest);
      let best = white ? -Infinity : Infinity;
      let bestMove = null;

      for (const m of moves) {
        game.move(m);
        const score = alphabeta(game, depth - 1, alpha, beta, ply + 1, deadline, ctr);
        game.undo();
        if (white) {
          if (score > best) { best = score; bestMove = m; }
          if (best > alpha) alpha = best;
        } else {
          if (score < best) { best = score; bestMove = m; }
          if (best < beta) beta = best;
        }
        if (alpha >= beta) break; // kesme
      }

      // TT'ye yaz.
      let flag;
      if (best <= alphaOrig) flag = UPPER;
      else if (best >= betaOrig) flag = LOWER;
      else flag = EXACT;
      tt.set(key, {
        depth, score: best, flag,
        bestMove: bestMove ? { from: bestMove.from, to: bestMove.to, promotion: bestMove.promotion } : null,
      });

      return best;
    }

    /*
     * Tek bir derinlik icin kok aramasi. ttBest ile siralama tohumlanir.
     */
    function searchRoot(game, depth, deadline, ctr) {
      const white = game.turn() === "w";
      const rootEntry = tt.get(ttKey(game));
      const moves = orderedMoves(game, rootEntry ? rootEntry.bestMove : null);

      let bestMove = moves[0];
      let bestScore = white ? -Infinity : Infinity;
      let alpha = -Infinity, beta = Infinity;
      let evaluated = 0;

      for (const m of moves) {
        game.move(m);
        let score;
        try {
          score = alphabeta(game, depth - 1, alpha, beta, 1, deadline, ctr);
        } finally {
          game.undo(); // TIME_UP atilsa bile tahtayi geri al (kirli birakma)
        }
        evaluated++;
        if (white) {
          if (score > bestScore) { bestScore = score; bestMove = m; }
          if (bestScore > alpha) alpha = bestScore;
        } else {
          if (score < bestScore) { bestScore = score; bestMove = m; }
          if (bestScore < beta) beta = bestScore;
        }
      }
      return { move: bestMove, score: bestScore, evaluated };
    }

    /*
     * En iyi hamle. Iki cagri bicimi:
     *   bestMove(fen)                       -> varsayilan derinlik/zaman
     *   bestMove(fen, depth)                -> sabit derinlik (geriye uyumlu)
     *   bestMove(fen, { maxDepth, timeMs }) -> iterative deepening + zaman butcesi
     * Doner: { move, score, evaluated, depthReached }
     */
    function bestMove(fen, arg) {
      let maxDepth = defaultDepth;
      let timeMs = defaultTimeMs;
      if (typeof arg === "number") {
        maxDepth = arg; timeMs = 0; // eski cagri: sabit derinlik, zaman siniri yok
      } else if (arg && typeof arg === "object") {
        if (arg.maxDepth) maxDepth = arg.maxDepth;
        if (arg.depth) maxDepth = arg.depth;
        if (arg.timeMs != null) timeMs = arg.timeMs;
      }

      const game = new Chess(fen);
      if (game.isGameOver()) return { move: null, score: 0, evaluated: 0, depthReached: 0 };

      const timed = timeMs > 0;
      const startTime = Date.now();
      const ctr = { n: 0 };

      let result = null;
      let depthReached = 0;
      for (let d = 1; d <= maxDepth; d++) {
        // Derinlik 1 HER ZAMAN zaman sinirsiz tamamlanir: gecerli bir hamle
        // garanti edilir. Sonraki derinlikler zaman butcesine tabidir.
        const deadline = (timed && d > 1) ? Date.now() + timeMs : Infinity;
        // Her derinlikte TAZE tahta: TIME_UP arama ortasinda atilirsa onceki
        // tahta kirli kalabilir; taze klon bir sonraki derinligi korur.
        const board = new Chess(fen);
        try {
          const r = searchRoot(board, d, deadline, ctr);
          result = r;
          depthReached = d;
        } catch (err) {
          if (err === TIME_UP) break; // zaman doldu: son TAM derinligi koru
          throw err;
        }
        // Zaman dolduysa daha derine inme (bir sonraki tam derinlik bitmez).
        if (timed && Date.now() >= startTime + timeMs) break;
      }

      return {
        move: result.move, score: result.score,
        evaluated: result.evaluated, depthReached,
      };
    }

    return { bestMove, leafScore, _maxDepth: defaultDepth };
}

// Zaman asimi sinyali (exception olarak firlatilir, kokte yakalanir).
const TIME_UP = Symbol("TIME_UP");
function checkTime(deadline, ctr) {
  if (deadline === Infinity) return;
  if ((++ctr.n & 255) === 0 && Date.now() > deadline) throw TIME_UP;
}
