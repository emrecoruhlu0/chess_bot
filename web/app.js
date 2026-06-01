/*
 * Uygulama mantigi: tahta cizimi (diff + animasyon), kullanici etkilesimi,
 * bot ile oyun akisi, hamle gezinme + inceleme modu.
 * - Mantik: chess.js (legal hamleler, durum, FEN).
 * - Bot: bot.worker.js (ayri thread'de minimax + ML degerlendirme).
 * - Tahta: 3 katmanli (squares/hints/pieces). Taslar SVG <img>, mutlak
 *   konumlu, transform ile kayar. Render tam-rebuild yerine fark gunceller.
 */
import { Chess } from "./node_modules/chess.js/dist/esm/chess.js";
import { initTheme, toggleTheme, themeIcon } from "./ui/theme.js";
import { playMove, playCapture, playCheck, playGameEnd, isMuted, toggleMuted } from "./ui/sound.js";

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
const START_COUNTS = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9 };

function pieceSrc(color, type) {
  return `./pieces/${color}${type.toUpperCase()}.svg`;
}

const els = {
  board: document.getElementById("board"),
  status: document.getElementById("status"),
  eval: document.getElementById("eval"),
  evalBar: document.getElementById("eval-bar-fill"),
  evalLabel: document.getElementById("eval-bar-label"),
  thinking: document.getElementById("thinking"),
  newGame: document.getElementById("new-game"),
  undo: document.getElementById("undo"),
  flip: document.getElementById("flip"),
  side: document.getElementById("side-select"),
  depth: document.getElementById("depth-select"),
  history: document.getElementById("history"),
  capturedTop: document.getElementById("captured-top"),
  capturedBottom: document.getElementById("captured-bottom"),
  themeToggle: document.getElementById("theme-toggle"),
  soundToggle: document.getElementById("sound-toggle"),
  navStart: document.getElementById("nav-start"),
  navBack: document.getElementById("nav-back"),
  navFwd: document.getElementById("nav-fwd"),
  navEnd: document.getElementById("nav-end"),
};

const game = new Chess();
let worker = null;
let workerReady = false;
let humanColor = "w";       // insanin rengi
let orientation = "w";      // tahtanin gosterim yonu
let selected = null;        // secili kare
let legalTargets = [];      // secili tasin gidebilecegi kareler
let busy = false;           // bot dusunurken girisi kilitle

/* Gezinme / inceleme durumu */
let fenHistory = [new Chess().fen()]; // index = ply (0 = baslangic), N = N. hamleden sonra
let viewPly = 0;            // tahtada gosterilen pozisyon (en son = fenHistory.length-1)
let reviewMode = false;     // oyun bitti -> gecmisten dal acilabilir

/* Render diff durumu */
let squareLayer, hintsLayer, piecesLayer, coordsLayer;
let pieceEls = new Map();   // kare -> { el, img, color, type }
let pendingRemovals = new Map(); // kare -> timeout id (yakalanan tas temizligi)

/* ---- Yardimcilar ---- */
function isLive() { return viewPly === fenHistory.length - 1; }

function boardAt(ply) {
  // O ply'deki pozisyonun board()'unu dondur.
  return new Chess(fenHistory[ply]).board();
}

function moveAtPly(ply) {
  // ply. hamlenin verbose bilgisi (1-tabanli: ply=1 ilk hamle). yoksa null.
  if (ply < 1) return null;
  const h = game.history({ verbose: true });
  return h[ply - 1] || null;
}

/** Kareyi (orn 'e4') ekran gridindeki {col,row} (0-7) degerine cevir, flip dahil. */
function squareToXY(sq) {
  const f = FILES.indexOf(sq[0]);
  const r = parseInt(sq[1], 10);
  const col = orientation === "w" ? f : 7 - f;
  const row = orientation === "w" ? 8 - r : r - 1;
  return { col, row };
}

function pxTransform(sq) {
  const { col, row } = squareToXY(sq);
  return `translate(calc(${col} * var(--sq-size)), calc(${row} * var(--sq-size)))`;
}

/* ---- Worker kurulum ---- */
async function setupWorker() {
  workerReady = false;
  if (worker) worker.terminate();
  worker = new Worker("./bot.worker.js", { type: "module" });
  worker.onmessage = onWorkerMessage;
  const model = await fetch("./model.json").then((r) => r.json());
  const lv = difficulty();
  worker.postMessage({ type: "init", model, maxDepth: lv.maxDepth, timeMs: lv.timeMs });
}

/* Zorluk seviyesi -> arama butcesi (iterative deepening tavani + zaman). */
function difficulty() {
  switch (els.depth.value) {
    case "easy": return { maxDepth: 3, timeMs: 300 };
    case "hard": return { maxDepth: 8, timeMs: 2500 };
    case "medium":
    default: return { maxDepth: 6, timeMs: 1000 };
  }
}

function onWorkerMessage(e) {
  const msg = e.data;
  if (msg.type === "ready") { workerReady = true; return; }
  if (msg.type === "error") {
    setStatus("Bot hatasi: " + msg.error);
    busy = false;
    els.thinking.classList.add("hidden");
    return;
  }
  if (msg.type === "bestmove") {
    els.thinking.classList.add("hidden");
    if (msg.move) {
      const wasLive = isLive(); // bot cevabi gelmeden kullanici sona mi bakiyordu?
      const result = game.move(msg.move);
      fenHistory.push(game.fen());
      updateEvalFromScore(msg.score, msg.evaluated, msg.ms, msg.depthReached);
      if (wasLive) {
        // Kullanici canliydi: hamleyi animasyonla goster, sona kil.
        viewPly = fenHistory.length - 1;
        updateBoard(/*animate*/ true);
      } else {
        // Kullanici gecmise bakiyordu: yerini koru, sadece bilgilendir.
        renderCaptured(); renderHistory(); updateNavButtons(); updateStatus();
      }
    }
    busy = false;
    checkGameOver();
  }
}

/* ---- Bot'a sira ver ---- */
function botMove() {
  if (game.isGameOver()) return;
  busy = true;
  els.thinking.classList.remove("hidden");
  setStatus("Bot dusunuyor...");
  const lv = difficulty();
  const send = () => worker.postMessage({ type: "move", fen: game.fen(), maxDepth: lv.maxDepth, timeMs: lv.timeMs });
  if (workerReady) send();
  else setTimeout(() => (workerReady ? send() : botMove()), 50);
}

/* ============================================================
   Tahta cizimi: katmanlari bir kez kur, sonra fark gunceller.
   ============================================================ */
function buildBoard() {
  els.board.innerHTML = "";
  squareLayer = document.createElement("div");
  squareLayer.className = "squares-layer";
  hintsLayer = document.createElement("div");
  hintsLayer.className = "hints-layer";
  piecesLayer = document.createElement("div");
  piecesLayer.className = "pieces-layer";
  coordsLayer = document.createElement("div");
  coordsLayer.className = "coords-layer";

  // 64 statik kare (gosterim yonune gore renk).
  const ranks = orientation === "w" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === "w" ? FILES : [...FILES].reverse();
  for (const rank of ranks) {
    for (const file of files) {
      const sq = file + rank;
      const cell = document.createElement("div");
      const dark = (FILES.indexOf(file) + rank) % 2 === 0;
      cell.className = "square " + (dark ? "dark" : "light");
      cell.dataset.square = sq;
      squareLayer.appendChild(cell);
    }
  }
  // Tek delege tiklama listener'i.
  squareLayer.addEventListener("click", (e) => {
    const cell = e.target.closest(".square");
    if (cell) onSquareClick(cell.dataset.square);
  });

  els.board.append(squareLayer, hintsLayer, piecesLayer, coordsLayer);
  pieceEls.clear();
  renderCoords();
  resetPieces();
}

/** Tum tas elemanlarini sil, mevcut gosterilen pozisyondan yeniden kur (animasyonsuz). */
function resetPieces() {
  piecesLayer.innerHTML = "";
  pieceEls.clear();
  for (const [, t] of pendingRemovals) clearTimeout(t);
  pendingRemovals.clear();

  const board = boardAt(viewPly);
  piecesLayer.classList.add("no-anim");
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      const sq = FILES[c] + (8 - r);
      addPieceEl(sq, p.color, p.type);
    }
  }
  // bir frame sonra animasyon yeniden acilir
  requestAnimationFrame(() => requestAnimationFrame(() => piecesLayer.classList.remove("no-anim")));
  renderHints();
}

function addPieceEl(sq, color, type) {
  const el = document.createElement("div");
  el.className = "piece";
  el.dataset.square = sq;
  el.style.transform = pxTransform(sq);
  const img = document.createElement("img");
  img.src = pieceSrc(color, type);
  img.draggable = false;
  img.alt = "";
  el.appendChild(img);
  piecesLayer.appendChild(el);
  pieceEls.set(sq, { el, img, color, type });
  return pieceEls.get(sq);
}

function movePieceEl(from, to) {
  const rec = pieceEls.get(from);
  if (!rec) return null;
  pieceEls.delete(from);
  // Eger hedefte zaten kayitli bir eleman varsa (capture), once temizle.
  rec.el.dataset.square = to;
  rec.el.style.transform = pxTransform(to);
  pieceEls.set(to, rec);
  return rec;
}

function fadeRemoveAt(sq) {
  const rec = pieceEls.get(sq);
  if (!rec) return;
  pieceEls.delete(sq);
  const { col, row } = squareToXY(sq);
  rec.el.style.setProperty("--tx", `calc(${col} * var(--sq-size))`);
  rec.el.style.setProperty("--ty", `calc(${row} * var(--sq-size))`);
  rec.el.classList.add("captured");
  const done = () => { rec.el.remove(); pendingRemovals.delete(sq); };
  const t = setTimeout(done, 300);
  pendingRemovals.set(sq, t);
  rec.el.addEventListener("transitionend", () => { clearTimeout(t); done(); }, { once: true });
}

/**
 * Tahtayi guncelle. animate=true ise son hamleyi kayma animasyonuyla uygular.
 * Canli pozisyonda diff yapar; gezinmede snap (resetPieces).
 */
function updateBoard(animate) {
  if (!animate) {
    resetPieces();
    finishUpdate();
    return;
  }
  // Canli son hamle: verbose bilgisinden tasi tasi.
  const h = game.history({ verbose: true });
  const mv = h[h.length - 1];
  if (!mv) { resetPieces(); finishUpdate(); return; }

  // Onceki hamleden kalan bekleyen silme hedefte varsa hemen temizle (cakismayi onle).
  if (pendingRemovals.has(mv.to)) {
    clearTimeout(pendingRemovals.get(mv.to));
    pendingRemovals.delete(mv.to);
  }

  // Yakalama (en passant dahil)
  if (mv.flags.includes("e")) {
    // en passant: yakalanan piyon to'nun arkasinda (from'un yatayinda)
    const epSq = mv.to[0] + mv.from[1];
    fadeRemoveAt(epSq);
    playCapture();
  } else if (mv.captured) {
    fadeRemoveAt(mv.to); // hedefteki dusman fade out
    playCapture();
  } else {
    playMove();
  }

  // Tasi tasi
  const moved = movePieceEl(mv.from, mv.to);
  if (moved) {
    moved.el.classList.add("dragging-z");
    setTimeout(() => moved.el.classList.remove("dragging-z"), 260);
  } else {
    // beklenmedik durum: snap
    resetPieces();
    finishUpdate();
    return;
  }

  // Rok: kaleyi de tasi
  if (mv.flags.includes("k") || mv.flags.includes("q")) {
    const rank = mv.from[1];
    if (mv.flags.includes("k")) movePieceEl("h" + rank, "f" + rank);
    else movePieceEl("a" + rank, "d" + rank);
  }

  // Terfi: varista img'i degistir
  if (mv.promotion) {
    const swap = () => { if (moved.img) { moved.img.src = pieceSrc(mv.color, mv.promotion); moved.type = mv.promotion; } };
    let swapped = false;
    const fb = setTimeout(() => { if (!swapped) { swapped = true; swap(); } }, 260);
    moved.el.addEventListener("transitionend", () => { if (!swapped) { swapped = true; clearTimeout(fb); swap(); } }, { once: true });
  }

  // Sah sesi (hamle sesinin uzerine)
  if (game.inCheck()) playCheck();

  finishUpdate();
}

function finishUpdate() {
  renderHints();
  renderCaptured();
  updateStatus();
  renderHistory();
  updateNavButtons();
}

/* ---- Vurgular (hints-layer) ---- */
function renderHints() {
  hintsLayer.innerHTML = "";
  // Son hamle
  const mv = moveAtPly(viewPly);
  if (mv) { addOverlay(mv.from, "lastmove"); addOverlay(mv.to, "lastmove"); }

  // Sah (gosterilen pozisyonda) — sadece canli tahtada anlamli, basitlik icin canli
  if (isLive() && game.inCheck()) {
    const king = findKing(game.turn());
    if (king) addOverlay(king, "check");
  }

  // Secim + legal hedefler (sadece canli ve oynanabilir durumda)
  if (selected) {
    addOverlay(selected, "selected");
    for (const sq of legalTargets) {
      const occupied = game.get(sq);
      addOverlay(sq, occupied ? "capture-hint" : "move-hint");
    }
  }
}

function addOverlay(sq, cls) {
  const o = document.createElement("div");
  o.className = "overlay " + cls;
  o.style.transform = pxTransform(sq);
  hintsLayer.appendChild(o);
}

function findKing(color) {
  const board = game.board();
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type === "k" && p.color === color) return FILES[c] + (8 - r);
    }
  return null;
}

/* ---- Koordinatlar (her etiket, ilgili karenin kosesine yerlesir) ---- */
function renderCoords() {
  coordsLayer.innerHTML = "";
  const ranks = orientation === "w" ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files = orientation === "w" ? FILES : [...FILES].reverse();

  // Dosya harfleri: en alt sira (ri = 7) karelerinin sag-alt kosesi.
  files.forEach((f, ci) => {
    const bottomRank = ranks[7];
    const dark = (FILES.indexOf(f) + bottomRank) % 2 === 0;
    coordsLayer.appendChild(makeCoordCell(ci, 7, f, "file", dark));
  });
  // Rank sayilari: en sol sutun (ci = 0) karelerinin sol-ust kosesi.
  ranks.forEach((r, ri) => {
    const leftFile = files[0];
    const dark = (FILES.indexOf(leftFile) + r) % 2 === 0;
    coordsLayer.appendChild(makeCoordCell(0, ri, r, "rank", dark));
  });
}

function makeCoordCell(col, row, text, kind, dark) {
  const cell = document.createElement("div");
  cell.style.position = "absolute";
  cell.style.width = "var(--sq-size)";
  cell.style.height = "var(--sq-size)";
  cell.style.transform = `translate(calc(${col} * var(--sq-size)), calc(${row} * var(--sq-size)))`;
  const lbl = document.createElement("span");
  lbl.className = "coord " + kind + " " + (dark ? "on-dark" : "on-light");
  lbl.textContent = text;
  cell.appendChild(lbl);
  return cell;
}

/* ---- Yakalanan taslar ---- */
function computeCaptured() {
  const board = game.board();
  const remaining = { w: {}, b: {} };
  for (const row of board) for (const p of row) {
    if (p) remaining[p.color][p.type] = (remaining[p.color][p.type] || 0) + 1;
  }
  const lost = { w: [], b: [] };
  let scoreW = 0, scoreB = 0;
  for (const color of ["w", "b"]) {
    for (const t of ["q", "r", "b", "n", "p"]) {
      const missing = START_COUNTS[t] - (remaining[color][t] || 0);
      for (let i = 0; i < missing; i++) lost[color].push(t);
      if (color === "w") scoreW += missing * PIECE_VALUE[t];
      else scoreB += missing * PIECE_VALUE[t];
    }
  }
  // beyaz avantaji = siyahin kaybettigi - beyazin kaybettigi
  return { lost, adv: scoreB - scoreW };
}

function renderCaptured() {
  const { lost, adv } = computeCaptured();
  // adv = beyaz materyal avantaji (siyahin kaybi - beyazin kaybi).
  // Tahtanin ust kenari, gosterim yonune gore karsi tarafin (ust oyuncu) rengi:
  //   orientation 'w' -> ust = siyah oyuncu, alt = beyaz oyuncu.
  const topColor = orientation === "w" ? "b" : "w";   // ustteki oyuncunun rengi
  const botColor = orientation === "w" ? "w" : "b";   // alttaki oyuncunun rengi
  // Bir oyuncunun "yakaladigi" taslar = rakibinin kaybettikleri.
  const topAdv = topColor === "w" ? adv : -adv;
  const botAdv = botColor === "w" ? adv : -adv;
  // Ust oyuncunun yakaladiklari = rakibinin (opp) kaybettikleri, opp renginde gosterilir.
  fillCaptured(els.capturedTop, { color: opp(topColor), types: lost[opp(topColor)] }, topAdv);
  fillCaptured(els.capturedBottom, { color: opp(botColor), types: lost[opp(botColor)] }, botAdv);
}

function opp(c) { return c === "w" ? "b" : "w"; }

// container'da, "lostTypes" (kaybeden tarafin taslari, o renkte ikonlar) gosterilir.
function fillCaptured(container, lostTypes, advForThisSide) {
  container.innerHTML = "";
  const order = ["q", "r", "b", "n", "p"];
  const sorted = [...lostTypes.types].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  for (const t of sorted) {
    const img = document.createElement("img");
    img.src = pieceSrc(lostTypes.color, t);
    img.alt = "";
    container.appendChild(img);
  }
  if (advForThisSide > 0) {
    const span = document.createElement("span");
    span.className = "captured-adv";
    span.textContent = "+" + advForThisSide;
    container.appendChild(span);
  }
}

/* ---- Kullanici etkilesimi ---- */
function onSquareClick(sq) {
  if (busy) return;

  // Inceleme modunda gecmis bir pozisyondayken tiklama -> o pozisyondan dal ac.
  if (reviewMode && !isLive()) {
    enterReviewBranchIfNeeded(); // game artik bu pozisyonda, isLive() true olur
    clearSelection();
    resetPieces();
    renderHistory();
    updateNavButtons();
  }
  if (!canPlayNow()) return;

  // Inceleme dalinda insan her iki rengi de oynayabilir; normalde sadece kendi rengi.
  const myColor = reviewMode ? game.turn() : humanColor;
  if (!reviewMode && game.turn() !== humanColor) return;

  const piece = game.get(sq);

  if (selected) {
    if (piece && piece.color === myColor) { selectSquare(sq); return; }
    if (legalTargets.includes(sq)) { makeHumanMove(selected, sq); return; }
    clearSelection(); renderHints(); return;
  }
  if (piece && piece.color === myColor) selectSquare(sq);
}

/** Su an oynanabilir mi? Canli pozisyonda olmali (gezinmede oynanmaz). */
function canPlayNow() {
  if (game.isGameOver()) return false; // mat/pat olan pozisyonda oynanmaz
  if (!isLive()) return false;
  return true;
}

function selectSquare(sq) {
  selected = sq;
  legalTargets = game.moves({ square: sq, verbose: true }).map((m) => m.to);
  renderHints();
}

function clearSelection() { selected = null; legalTargets = []; }

function makeHumanMove(from, to) {
  const moving = game.get(from);
  const isPromotion = moving && moving.type === "p" && (to[1] === "8" || to[1] === "1");
  const move = { from, to };
  if (isPromotion) move.promotion = "q";

  const result = game.move(move);
  if (!result) { clearSelection(); renderHints(); return; }
  pushFen();
  clearSelection();
  afterMove(result, /*fromBot*/ false);
  checkGameOver();
  // Bot, insanin rengi disindaki taraf hamle sirasi geldiyse oynar.
  // (Hem normal oyunda hem inceleme dalinda gecerli.)
  if (!game.isGameOver() && game.turn() !== humanColor) botMove();
}

/** Hamle sonrasi ortak: fen listesi guncel, viewPly sona, tahta animasyonlu cizilir. */
function afterMove(result, fromBot) {
  viewPly = fenHistory.length - 1; // sona kil
  updateBoard(/*animate*/ true);
}

function pushFen() {
  fenHistory.push(game.fen());
  viewPly = fenHistory.length - 1;
}

/* ---- Durum / degerlendirme ---- */
function setStatus(text, cls) {
  els.status.textContent = text;
  els.status.classList.toggle("watching", cls === "watching");
}

function updateStatus() {
  if (!isLive()) {
    setStatus("İzleme modu — oynamak için sona dön (⏭)", "watching");
    return;
  }
  if (game.isGameOver()) { showGameOver(); return; }
  if (busy) { setStatus("Bot dusunuyor..."); return; }
  const turn = game.turn() === "w" ? "Beyaz" : "Siyah";
  const who = reviewMode ? "(inceleme)" : (game.turn() === humanColor ? "(siz)" : "(bot)");
  let s = `${turn} oynayacak ${who}`;
  if (game.inCheck()) s += " — ŞAH!";
  setStatus(s);
}

function updateEvalFromScore(score, evaluated, ms, depthReached) {
  let pct, text;
  if (Math.abs(score) >= 900) {
    const whiteWinning = score > 0;
    pct = whiteWinning ? 100 : 0;
    text = "Mat yolda " + (whiteWinning ? "(beyaz)" : "(siyah)");
  } else {
    const prob = (score + 1) / 2;
    pct = Math.round(prob * 100);
    text = `Beyaz kazanma: %${pct}`;
  }
  const depthStr = depthReached ? `derinlik ${depthReached}, ` : "";
  els.eval.textContent = `${text}  ·  ${depthStr}${ms}ms`;
  els.evalBar.style.height = pct + "%";
  els.evalLabel.textContent = pct + "%";
}

function checkGameOver() {
  if (!game.isGameOver()) return;
  reviewMode = true;
  playGameEnd();
  showGameOver();
}

function showGameOver() {
  let msg;
  if (game.isCheckmate()) {
    const winner = game.turn() === "w" ? "Siyah" : "Beyaz";
    msg = `Şah mat! ${winner} kazandı. (İnceleme modu — geçmişten oynayabilirsin)`;
  } else if (game.isStalemate()) msg = "Pat — beraberlik. (İnceleme modu)";
  else if (game.isInsufficientMaterial()) msg = "Yetersiz materyal — beraberlik. (İnceleme modu)";
  else if (game.isThreefoldRepetition()) msg = "Üç kez tekrar — beraberlik. (İnceleme modu)";
  else if (game.isDraw()) msg = "Beraberlik (50 hamle kuralı). (İnceleme modu)";
  else msg = "Oyun bitti.";
  setStatus(msg);
}

/* ---- Hamle gecmisi + gezinme ---- */
function renderHistory() {
  const sans = game.history();
  els.history.innerHTML = "";
  for (let i = 0; i < sans.length; i++) {
    const ply = i + 1;
    if (i % 2 === 0) {
      const num = document.createElement("span");
      num.className = "hist-num";
      num.textContent = `${i / 2 + 1}. `;
      els.history.appendChild(num);
    }
    const m = document.createElement("span");
    m.className = "hist-move" + (ply === viewPly ? " active" : "");
    m.dataset.ply = ply;
    m.textContent = sans[i] + " ";
    m.addEventListener("click", () => goToPly(ply));
    els.history.appendChild(m);
  }
  // Aktif hamleyi gorunur kil — ama SADECE history kutusu icinde kaydir,
  // scrollIntoView tum sayfayi kaydirabildigi icin manuel hesapla.
  const active = els.history.querySelector(".hist-move.active");
  if (active) {
    const box = els.history;
    const top = active.offsetTop;
    const bottom = top + active.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
  }
}

function goToPly(ply) {
  const clamped = Math.max(0, Math.min(ply, fenHistory.length - 1));
  if (clamped === viewPly) return;
  viewPly = clamped;
  clearSelection();
  resetPieces();        // gosterilen pozisyonu snap ile ciz
  renderCaptured();
  updateStatus();
  renderHistory();
  updateNavButtons();
}

function stepBack() { goToPly(viewPly - 1); }
function stepForward() { goToPly(viewPly + 1); }
function goStart() { goToPly(0); }
function goEnd() { goToPly(fenHistory.length - 1); }

function updateNavButtons() {
  const atStart = viewPly === 0;
  const atEnd = isLive();
  els.navStart.disabled = atStart;
  els.navBack.disabled = atStart;
  els.navFwd.disabled = atEnd;
  els.navEnd.disabled = atEnd;
}

/* ---- Inceleme dali (oyun bitti, gecmisten oyna) ---- */
function enterReviewBranchIfNeeded() {
  // makeHumanMove cagrilmadan once: eger reviewMode ve viewPly canli degilse,
  // game'i o pozisyondan yeniden kur ve sonrasini kirp.
  if (reviewMode && !isLive()) {
    const fen = fenHistory[viewPly];
    rebuildGameFromFen(fen, viewPly);
  }
}

function rebuildGameFromFen(fen, ply) {
  // game'i fen'den kur; fenHistory'yi ply'ye kadar kirp; bottaki SAN listesini
  // yeniden uretmek icin: yeni game'in history'si bos olur, bu yuzden onceki
  // SAN'lari korumak adina tum hamleleri ply'ye kadar tekrar oynamak gerekir.
  const prevSans = game.history();
  game.reset();
  // ply'ye kadar olan hamleleri tekrar oyna (SAN listesi korunur)
  for (let i = 0; i < ply; i++) game.move(prevSans[i]);
  fenHistory = fenHistory.slice(0, ply + 1);
  viewPly = fenHistory.length - 1;
}

/* ---- Kontroller ---- */
function newGame() {
  game.reset();
  fenHistory = [game.fen()];
  viewPly = 0;
  reviewMode = false;
  els.eval.textContent = "—";
  els.evalBar.style.height = "50%";
  els.evalLabel.textContent = "50%";
  clearSelection();
  busy = false;
  els.thinking.classList.add("hidden");

  humanColor = els.side.value === "b" ? "b" : "w";
  orientation = humanColor;
  buildBoard();
  finishUpdate();

  if (humanColor === "b") botMove();
}

function undo() {
  if (busy || !isLive()) return;
  if (game.history().length === 0) return;
  reviewMode = false;
  game.undo();
  fenHistory.pop();
  if (game.turn() !== humanColor && game.history().length > 0) {
    game.undo();
    fenHistory.pop();
  }
  viewPly = fenHistory.length - 1;
  clearSelection();
  resetPieces();
  finishUpdate();
}

function flip() {
  orientation = orientation === "w" ? "b" : "w";
  buildBoard();   // kareler ve koordinatlar yeniden kurulur
  finishUpdate();
}

/* ---- Event baglama ---- */
els.newGame.addEventListener("click", newGame);
els.undo.addEventListener("click", undo);
els.flip.addEventListener("click", flip);
els.depth.addEventListener("change", () => setupWorker());

els.navStart.addEventListener("click", goStart);
els.navBack.addEventListener("click", stepBack);
els.navFwd.addEventListener("click", stepForward);
els.navEnd.addEventListener("click", goEnd);

document.addEventListener("keydown", (e) => {
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "select" || tag === "textarea") return;
  if (e.key === "ArrowLeft") { stepBack(); e.preventDefault(); }
  else if (e.key === "ArrowRight") { stepForward(); e.preventDefault(); }
  else if (e.key === "Home") { goStart(); e.preventDefault(); }
  else if (e.key === "End") { goEnd(); e.preventDefault(); }
});

els.themeToggle.addEventListener("click", () => {
  const t = toggleTheme();
  els.themeToggle.textContent = themeIcon(t);
});
els.soundToggle.addEventListener("click", () => {
  const muted = toggleMuted();
  els.soundToggle.textContent = muted ? "🔇" : "🔊";
  els.soundToggle.classList.toggle("muted", muted);
});

/* ---- Baslat ---- */
const theme = initTheme();
els.themeToggle.textContent = themeIcon(theme);
els.soundToggle.textContent = isMuted() ? "🔇" : "🔊";
els.soundToggle.classList.toggle("muted", isMuted());

await setupWorker();
buildBoard();
finishUpdate();
