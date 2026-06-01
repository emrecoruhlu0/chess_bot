# Bu satranç botu nasıl çalışıyor?

Bu bot, klasik bir satranç motorundan farklı bir mantık kullanıyor. **İnsan
hamlelerini taklit etmiyor**, bunun yerine 20.000 gerçek Lichess oyunundan
"hangi pozisyonlar kazanır" sorusunu öğrenmiş bir **makine öğrenmesi modeli**
ile **minimax arama**yı birleştiriyor.

İki ayrı dünya var:

- **Python tarafı (`training/`)** → modeli *bir kez* eğitir, çevrimdışı çalışır.
- **JavaScript tarafı (`web/`)** → tarayıcıda gerçek zamanlı oynar.

Bağlantı noktaları: model bir `model.json` dosyasına dökülür, özellik çıkarımı
ise iki dilde **birebir aynı** yazılır.

---

## 1. Veri → Etiketleme (`training/prepare_data.py`)

`games.csv` içinde 20.058 oyun var, her satırda hamleler (SAN formatı) ve kim
kazandığı.

Hazırlama adımı her oyunu baştan yeniden oynatır ve şu mantıkla pozisyonları
etiketler:

- Bir oyunu beyaz kazandıysa, o oyunda görülen **her pozisyona** `1.0` etiketi
  konur.
- Siyah kazandıysa `0.0`, beraberlikse `0.5`.
- Açılışın ilk 8 yarı-hamlesi atlanır (her oyunda benzer, az bilgi taşır).
- Her oyundan rastgele 6 pozisyon seçilir.

> Buradaki püf nokta: bot "insanlar bu pozisyonda ne oynamış" değil, **"bu
> pozisyon kazanmaya mı gidiyor"** öğreniyor. Sonuç: 115.939 etiketli pozisyon.

## 2. Özellik çıkarımı (`training/features.py`)

Her pozisyon 12 sayıya indirgenir (hepsi beyaz perspektifinden):

| Özellik | Açıklama |
|---|---|
| `[0..4]` Materyal farkı | Beyaz − siyah taş sayısı (piyon, at, fil, kale, vezir) |
| `[5..10]` Piece-square skoru | Taşların konumuna göre ağırlıklı toplam (P,N,B,R,Q,K) |
| `[11]` Sıra | Beyaz mı oynayacak (+1 / −1) |

Piece-square tabloları, bir taşın tahtada **nerede durduğunun** ne kadar iyi
olduğunu söyleyen standart değerlerdir (ör. at merkezi sever, şah köşeyi).

## 3. Model eğitimi (`training/train.py`)

Model basit bir **lojistik regresyon**: `p(beyaz kazanır) = sigmoid(w·özellikler + b)`.

- Beraberlikler hem 0 hem 1 sınıfına yarım ağırlıkla eklenir (nötr sinyal).
- Çıktı: 12 ağırlık + 1 sabit (intercept).

**En güzel kısım:** Model, "kim kazandı" verisinden taş değerlerini
*kendiliğinden* öğrenmiş. `model.json`'daki materyal ağırlıkları:

```
piyon: 0.37   at: 0.88   fil: 0.99   kale: 1.30   vezir: 2.48
```

Yani vezir > kale > fil ≈ at > piyon. Kimse bu değerleri kodlamadı — satranç
sezgisi veriden çıktı.

## 4. Modeli web'e taşıma (`training/export_model.py`)

`model.json`'a sadece ağırlıklar + intercept + özellik adları yazılır. JS
tarafının ihtiyacı olan tek şey bu. Hem `web/model.json` hem `model/model.json`
(arşiv kopyası) yazılır.

---

## 5. Tarayıcı tarafı — botun gerçek zamanlı oynaması

### a) Değerlendirme (`web/evaluate.js`)

Python'daki formülün aynısı: FEN → 12 özellik → `sigmoid(w·x + b)` → beyazın
kazanma olasılığı (0..1).

### b) Arama motoru (`web/engine.js`) — botun "düşünmesi"

Burası işin kalbi: **minimax + alpha-beta budama**.

- Bot olası hamleleri dener, sonra rakibin cevaplarını, sonra kendi cevabını...
  varsayılan **3 hamle ileri** bakar.
- En derindeki (yaprak) pozisyonları ML modeliyle skorlar.
- Beyaz skoru **maksimize**, siyah **minimize** etmeye çalışır.
- **Alpha-beta budama**: belli olmuş kötü dalları hesaplamadan atlar (hız için).
- **Mat/pat özel ele alınır**: mat ±1000 puan, kısa matlar tercih edilir.
- **Hamle sıralaması (MVV-LVA)**: önce taş alan hamleler denenir ki budama daha
  çok kessin.

> Yani model "bu pozisyon ne kadar iyi" der; motor ise "ileriyi düşünerek
> kazanma şansını en yükselten hamle hangisi" sorusunu çözer. İkisi birlikte
> çalışır.

### c) Worker (`web/bot.worker.js`)

Arama ağır olduğu için ayrı bir thread'de (Web Worker) çalışır, böylece UI
donmaz. Ana thread `{fen, depth}` gönderir, worker `{move, score, ms}` döner.

### d) Arayüz (`web/app.js`)

Tahtayı çizer, senin hamleni alır, botun hamlesini worker'dan isteyip tahtaya
uygular.

---

## Kritik nokta: "Parity" (denklik)

`training/features.py` (Python) ile `web/features.js` (JavaScript) **birebir
aynı sayıları** üretmek zorunda. Çünkü model Python'da öğrenilen sayılara göre
kalibre edildi; JS farklı sayı üretirse model anlamsız sonuç verir. Bu yüzden
`web/verify_parity.js` testi var: ikisini karşılaştırır.

Birini değiştirirsen diğerini de güncelle ve `verify_parity.js` çalıştır.

---

## Özet akış

```
games.csv → [Python] pozisyonları sonuçla etiketle → 12 özellik çıkar
          → lojistik regresyon eğit → model.json (ağırlıklar)
                                          │
                                          ▼
[JS] FEN → 12 özellik → sigmoid(w·x+b) = kazanma olasılığı
       └─ minimax + alpha-beta bu değerlendirmeyle 3 hamle ileri bakar
       └─ en iyi hamleyi seçer → tahtaya oynar
```

---

## Çalıştırma

### Web arayüzü (botla oyna)

```powershell
cd web
node server.js          # http://127.0.0.1:5500
```

### Modeli yeniden eğitmek (isteğe bağlı)

```powershell
cd training
..\.venv\Scripts\python.exe prepare_data.py     # games.csv → dataset.npz
..\.venv\Scripts\python.exe train.py            # → model_sklearn.joblib
..\.venv\Scripts\python.exe export_model.py     # → web/model.json
```

### Testler

```powershell
cd web
node verify_parity.js   # Python ve JS özellikleri birebir aynı mı?
node test_engine.js     # bedava taş / mate-in-1 / açılış doğru mu?
node test_game.js       # bot kendi kendine tam bir oyun oynuyor mu?
```
