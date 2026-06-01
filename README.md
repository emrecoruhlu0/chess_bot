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
   prepare_data.py → dataset.npz   (115.939 pozisyon, 23 özellik)
   train.py        → LR baseline + küçük MLP, karşılaştır, kazananı seç
   export_model.py → web/model.json (model + ölçekleyici)
   ▼
web/  (JavaScript — tarayıcı)
   features.js  → pozisyondan 23 özellik (features.py ile BİREBİR aynı)
   evaluate.js  → model (LR veya MLP) → beyazın kazanma olasılığı
   engine.js    → minimax + alpha-beta + quiescence + TT + iterative deepening
   bot.worker.js→ aramayı ayrı thread'de çalıştırır (UI donmaz)
   app.js       → tahta çizimi + oyun akışı
```

### Model
İki model eğitilir, test log-loss'una göre kazanan seçilir (şu an: **MLP**):
- **Lojistik regresyon** — tek doğrusal katman, açıklanabilir ağırlıklar
- **Küçük MLP** — tek gizli katman (24 nöron, ReLU), doğrusal olmayan ilişkiler

Özellikler `StandardScaler` ile ölçeklenir; ölçekleyici model.json'a yazılır ve
JS tarafında birebir aynı uygulanır.

**23 özellik** (hepsi beyaz perspektifinden, beyaz − siyah):
- **Materyal** (5): piyon, at, fil, kale, vezir sayı farkı
- **Piece-square** (6): taşların konumuna göre ağırlıklı toplam (P,N,B,R,Q,K)
- **Sıra** (1): beyaz mı oynayacak
- **Mobility** (5): her taş tipinin pseudo-legal hamle sayısı
- **Piyon yapısı** (3): ikili (doubled), izole, geçer (passed) piyon farkı
- **Şah güvenliği** (2): şah önü piyon şilti, şaha saldıran taş sayısı
- **Açık dosya** (1): yarı-açık dosyadaki kale sayısı

> Yeni özellikler chess.js/python-chess hamle üretimi KULLANMAZ; iki dilde de
> birebir aynı, elle yazılmış pseudo-legal saldırı üreteciyle hesaplanır.
> Böylece Python↔JS parity garanti edilir (`verify_parity.js`).

### Arama
Minimax + alpha-beta budama. Beyaz skoru maksimize, siyah minimize eder.
- **Quiescence search**: yaprakta alış/terfi zincirlerini araştırır (taktiksel körlüğü azaltır)
- **Transposition table**: aynı pozisyonu (farklı yoldan gelince) yeniden hesaplamaz
- **Iterative deepening**: zaman bütçesine kadar kademeli derinleşir; en iyi hamle sıralamayı tohumlar
- **Eval cache** + **MVV-LVA** hamle sıralaması ile hızlandırılır

Zorluk seviyeleri zaman bütçesine bağlıdır: kolay 300ms, orta 1000ms, zor 2500ms.

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
node verify_parity.js   # Python ve JS ÖZELLİKLERİ birebir aynı mı? (23 özellik)
node verify_eval.js     # Python ve JS MODEL çıktısı birebir aynı mı? (scaler + MLP)
node test_engine.js     # bedava taş / mate-in-1 / açılış doğru mu?
node test_game.js       # bot kendi kendine tam bir oyun oynuyor mu?
node ab_match.js 12 200 # yeni bot eski bottan güçlü mü? (A/B maçı)
```
> `verify_eval.js` için önce `training/dump_eval_cases.py` çalıştırılıp
> `eval_cases.json` üretilmelidir (parity_cases.json'dan sonra). `ab_match.js`
> ise `model.json` + `model_old.json` (eski modelin yedeği) ile çalışır.

> **Önemli:** `training/features.py` ve `web/features.js` aynı sayıları üretmek
> zorundadır. Birini değiştirirsen diğerini güncelle ve `verify_parity.js` çalıştır.

## Klasör yapısı
```
chess_bot/
├── games.csv              ham veri (Lichess 20k)
├── training/              Python eğitim hattı
│   ├── features.py        özellik çıkarımı (Python — 23 özellik)
│   ├── prepare_data.py    veri hazırlama
│   ├── train.py           LR + MLP eğitimi, karşılaştırma
│   ├── export_model.py    JSON'a aktarım (model + ölçekleyici)
│   ├── dump_parity_cases.py / dump_eval_cases.py   parity test girdileri
├── web/                   tarayıcı uygulaması
│   ├── index.html / style.css
│   ├── features.js        özellik çıkarımı (JS — Python ile birebir)
│   ├── evaluate.js        model değerlendirme (LR/MLP)
│   ├── engine.js          minimax + alpha-beta + quiescence + TT + ID
│   ├── bot.worker.js      bot worker'ı
│   ├── app.js             UI + oyun akışı
│   ├── server.js          statik sunucu (bağımlılıksız)
│   ├── verify_parity.js / verify_eval.js / ab_match.js   testler
│   └── model.json         eğitilmiş model (+ ölçekleyici)
└── model/                 modelin arşiv kopyası
```

## Olası iyileştirmeler
- Açılış kitabı (games.csv'den en sık açılışlar)
- Daha derin/çok katmanlı MLP, daha fazla eğitim verisi
- Stockfish ile centipawn etiketleme (oyun sonucu yerine daha kaliteli sinyal)
- Endgame tabanları, oyun fazı (açılış/orta/son) özelliği

> Önceki listedeki şu maddeler **tamamlandı**: zengin özellikler (şah güvenliği,
> piyon yapısı, mobility), küçük sinir ağı (MLP), quiescence search,
> transposition table ve iterative deepening.
