/*
 * Tema yonetimi: acik/koyu, localStorage'da kalici.
 * <html data-theme="..."> uzerinden CSS degiskenleri secilir.
 */
const KEY = "chessTheme";

export function initTheme() {
  const saved = localStorage.getItem(KEY) || "dark";
  apply(saved);
  return saved;
}

export function toggleTheme() {
  const cur = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  const next = cur === "light" ? "dark" : "light";
  apply(next);
  localStorage.setItem(KEY, next);
  return next;
}

function apply(theme) {
  document.documentElement.dataset.theme = theme;
}

/** Tema butonu ikonu: koyudaysa ay, acikdaysa gunes goster. */
export function themeIcon(theme) {
  return theme === "light" ? "☀️" : "🌙";
}
