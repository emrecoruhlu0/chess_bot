/*
 * Satranc botu arama motoru: minimax + alpha-beta budama.
 *
 * Yaprak pozisyonlar evaluate.js (ML modeli) ile skorlanir; skor "beyazin
 * kazanma olasiligi" (0..1) oldugu icin:
 *    - beyaz oynarken skoru MAKSIMIZE eder,
 *    - siyah oynarken skoru MINIMIZE eder.
 *
 * Mat: kaybeden taraf icin 0/1 ucuna ek olarak, daha kisa matlari tercih
 * etmek icin derinlige gore kucuk bir ayar uygulanir.
 *
 * Disa baglilik enjekte edilir: bir evaluator (winProbWhite) ve Chess sinifi.
 */

// Mat skorlari (olasilik araliginin disinda, kesin sonuc).
export const MATE = 1000;

export function makeEngine(evaluator, Chess, opts) {
    opts = opts || {};
    const maxDepth = opts.depth || 3;

    /*
     * Terminal (oyun bitti) skoru: beyaz perspektifinden.
     * ply: koke olan uzaklik (kisa matlari tercih icin).
     */
    function terminalScore(game, ply) {
      if (game.isCheckmate()) {
        // Sira kimdeyse o mat olmustur (kaybetmistir).
        // game.turn() === 'w' -> beyaz mat -> siyah kazandi -> cok dusuk skor.
        const whiteLost = game.turn() === "w";
        return whiteLost ? -MATE + ply : MATE - ply;
      }
      return 0; // pat / beraberlik -> notr
    }

    /*
     * Yaprak degerlendirme: beyaz kazanma olasiligini [-1,1]'e tasiriz
     * (0.5 -> 0 notr) ki terminal skorlariyla ayni eksende olsun.
     */
    function leafScore(game) {
      const p = evaluator.winProbWhite(game.fen());
      return (p - 0.5) * 2; // 0..1 -> -1..1
    }

    // Ucuz hamle siralamasi icin taş degerleri (MVV-LVA).
    const PIECE_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

    /*
     * Hamle siralama: budamayi artirmak icin iyi hamleleri one al.
     * ML cagirmadan, ucuz sezgisel kullanir:
     *   - alma hamleleri once (en degerli kurban - en ucuz saldiran),
     *   - terfi ve sahlar bonus.
     * Boylece her dugumde N kez leafScore cagirmaktan kacinriz.
     */
    function orderedMoves(game) {
      const moves = game.moves({ verbose: true });
      moves.sort((a, b) => moveOrderScore(b) - moveOrderScore(a));
      return moves;
    }

    function moveOrderScore(m) {
      let s = 0;
      if (m.captured) {
        s += 10 * PIECE_VAL[m.captured] - PIECE_VAL[m.piece]; // MVV-LVA
      }
      if (m.promotion) s += 8 * (PIECE_VAL[m.promotion] || 9);
      if (m.san && m.san.includes("+")) s += 1; // sah
      return s;
    }

    function alphabeta(game, depth, alpha, beta, ply) {
      if (game.isGameOver()) {
        return terminalScore(game, ply);
      }
      if (depth === 0) {
        return leafScore(game);
      }

      const white = game.turn() === "w";
      const moves = orderedMoves(game);

      if (white) {
        let best = -Infinity;
        for (const m of moves) {
          game.move(m);
          const score = alphabeta(game, depth - 1, alpha, beta, ply + 1);
          game.undo();
          if (score > best) best = score;
          if (best > alpha) alpha = best;
          if (alpha >= beta) break; // beta kesme
        }
        return best;
      } else {
        let best = Infinity;
        for (const m of moves) {
          game.move(m);
          const score = alphabeta(game, depth - 1, alpha, beta, ply + 1);
          game.undo();
          if (score < best) best = score;
          if (best < beta) beta = best;
          if (alpha >= beta) break; // alpha kesme
        }
        return best;
      }
    }

    /*
     * Verilen FEN'de en iyi hamleyi bulur.
     * Donen: { move: <verbose move>, score, evaluated }
     */
    function bestMove(fen, depth) {
      const d = depth || maxDepth;
      const game = new Chess(fen);
      if (game.isGameOver()) return { move: null, score: 0, evaluated: 0 };

      const white = game.turn() === "w";
      const moves = orderedMoves(game);

      let bestMove = moves[0];
      let bestScore = white ? -Infinity : Infinity;
      let alpha = -Infinity;
      let beta = Infinity;
      let evaluated = 0;

      for (const m of moves) {
        game.move(m);
        const score = alphabeta(game, d - 1, alpha, beta, 1);
        game.undo();
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

    return { bestMove, leafScore, _maxDepth: maxDepth };
}
