/*
 * Bagimsiz statik dosya sunucusu (harici paket yok).
 * Calistir: node web/server.js   ->  http://localhost:8080
 *
 * ESM modulleri, Web Worker ve fetch() file:// uzerinden calismadigi icin
 * uygulamayi bir HTTP sunucusundan servis etmek gerekir.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = process.env.PORT || 8080;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".map": "application/json",
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";

    // Yol gezintisini engelle
    const safePath = normalize(join(ROOT, urlPath));
    if (!safePath.startsWith(ROOT)) {
      res.writeHead(403); res.end("Forbidden"); return;
    }

    const data = await readFile(safePath);
    const type = MIME[extname(safePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(data);
  } catch (err) {
    if (err.code === "ENOENT") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("404 — bulunamadi: " + req.url);
    } else {
      res.writeHead(500); res.end("500 — sunucu hatasi");
      console.error(err);
    }
  }
});

const HOST = process.env.HOST || "127.0.0.1";
server.listen(PORT, HOST, () => {
  console.log(`Satranc botu sunucusu calisiyor:  http://${HOST}:${PORT}`);
  console.log("Durdurmak icin Ctrl+C.");
});
