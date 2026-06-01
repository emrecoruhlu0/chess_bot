# Satranç Botu — ML Değerlendirme + Minimax

20.000 gerçek Lichess oyunundan **kazanmayı** öğrenmiş bir değerlendirme modeli ile
**minimax + alpha-beta** aramasını birleştiren, tarayıcıda oynanan bir satranç botu.

Bot insan hamlelerini taklit etmez; her pozisyon için "beyazın kazanma olasılığı"nı
tahmin eden bir model kullanır ve ileriyi düşünerek kazanma şansını en yükselten hamleyi seçer.

## Nasıl çalışır?

```
games.csv (20.058 oyun)
   │  her oyunu yeniden oyna, pozisyonlara oyunun SONUCUNU etiketle
   ▼
training/  (Python — offline, bir kez)
   prepare_data.py → dataset.npz   (115.939 pozisyon, 12 özellik)
   train.py        → lojistik regresyon  (özellik → kazanma olasılığı)
   export_model.py → web/model.json (ağırlıklar)
   ▼
web/  (JavaScript — tarayıcı)
   features.js  → pozisyondan 12 özellik (features.py ile BİREBİR aynı)
   evaluate.js  → sigmoid(w·x + b) = beyazın kazanma olasılığı
   engine.js    → minimax + alpha-beta, yaprakları evaluate.js ile skorlar
   bot.worker.js→ aramayı ayrı thread'de çalıştırır (UI donmaz)
   app.js       → tahta çizimi + oyun akışı
```

### Model
Lojistik regresyon. 12 özellik (hepsi beyaz perspektifinden):
- **Materyal farkı** (5): piyon, at, fil, kale, vezir sayı farkı
- **Piece-square skoru** (6): taşların konumuna göre ağırlıklı toplam (P,N,B,R,Q,K)
- **Sıra** (1): beyaz mı oynayacak

Model, kim kazandı verisinden taş değerlerini kendiliğinden öğrendi
(vezir > kale > fil ≈ at > piyon) — yani satranç sezgisi veriden çıktı.

### Arama
Minimax + alpha-beta budama. Beyaz skoru maksimize, siyah minimize eder.
Yaprak pozisyonlar ML modeliyle skorlanır; mat/pat özel ele alınır.
Hamle sıralaması (MVV-LVA) ile budama hızlandırılır.

## Çalıştırma

### 1) Web arayüzü (botla oyna)
```powershell
cd web
node server.js          # http://127.0.0.1:5500
# tarayıcıda aç: http://127.0.0.1:5500
```
> ESM modülleri, Web Worker ve fetch `file://` ile çalışmaz; sunucu gerekir.
> Port değiştirmek için: `$env:PORT="3000"; node server.js`

### 2) Modeli yeniden eğitmek (isteğe bağlı)
```powershell
# Python sanal ortamı (bir kez):
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install python-chess numpy scikit-learn pandas

cd training
..\.venv\Scripts\python.exe prepare_data.py     # games.csv → dataset.npz
..\.venv\Scripts\python.exe train.py            # → model_sklearn.joblib
..\.venv\Scripts\python.exe export_model.py     # → web/model.json
```

## Testler
```powershell
cd web
node verify_parity.js   # Python ve JS özellikleri birebir aynı mı?
node test_engine.js     # bedava taş / mate-in-1 / açılış doğru mu?
node test_game.js       # bot kendi kendine tam bir oyun oynuyor mu?
```

> **Önemli:** `training/features.py` ve `web/features.js` aynı sayıları üretmek
> zorundadır. Birini değiştirirsen diğerini güncelle ve `verify_parity.js` çalıştır.

## Klasör yapısı
```
chess_bot/
├── games.csv              ham veri (Lichess 20k)
├── training/              Python eğitim hattı
│   ├── features.py        özellik çıkarımı (Python)
│   ├── prepare_data.py    veri hazırlama
│   ├── train.py           model eğitimi
│   └── export_model.py    JSON'a aktarım
├── web/                   tarayıcı uygulaması
│   ├── index.html / style.css
│   ├── features.js        özellik çıkarımı (JS — Python ile birebir)
│   ├── evaluate.js        model değerlendirme
│   ├── engine.js          minimax + alpha-beta
│   ├── bot.worker.js      bot worker'ı
│   ├── app.js             UI + oyun akışı
│   ├── server.js          statik sunucu (bağımlılıksız)
│   └── model.json         eğitilmiş ağırlıklar
└── model/                 modelin arşiv kopyası
```

## Olası iyileştirmeler
- Açılış kitabı (games.csv'den en sık açılışlar)
- Daha zengin özellikler (şah güvenliği, piyon yapısı, hareket sayısı)
- Lojistik regresyon yerine küçük sinir ağı (aynı hat, model.json formatı değişir)
- Quiescence search (taş alma zincirlerinde daha derin bakış)
