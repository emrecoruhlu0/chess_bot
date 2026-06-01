/*
 * Ses efektleri: Web Audio ile uretilen kisa tonlar (harici dosya/internet yok).
 * AudioContext ilk kullanici etkilesiminde lazy olusturulur (tarayici autoplay kurali).
 * Mute durumu localStorage'da kalici.
 */
const KEY = "chessMuted";
let ctx = null;
let muted = localStorage.getItem(KEY) === "1";

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  }
  if (ctx && ctx.state === "suspended") ctx.resume();
  return ctx;
}

/** Tek bir ton: frekans, sure, dalga tipi, baslangic gecikmesi, ses seviyesi. */
function tone(freq, dur, type = "sine", delay = 0, gainPeak = 0.18) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export function playMove() {
  if (muted) return;
  tone(190, 0.07, "triangle", 0, 0.16);
}

export function playCapture() {
  if (muted) return;
  tone(130, 0.06, "square", 0, 0.13);
  tone(90, 0.1, "triangle", 0.04, 0.15);
}

export function playCheck() {
  if (muted) return;
  tone(660, 0.08, "sine", 0, 0.16);
  tone(880, 0.1, "sine", 0.09, 0.16);
}

export function playGameEnd() {
  if (muted) return;
  tone(523, 0.12, "sine", 0, 0.16);
  tone(659, 0.12, "sine", 0.12, 0.16);
  tone(784, 0.18, "sine", 0.24, 0.16);
}

export function isMuted() { return muted; }

export function setMuted(v) {
  muted = !!v;
  localStorage.setItem(KEY, muted ? "1" : "0");
  return muted;
}

export function toggleMuted() { return setMuted(!muted); }
