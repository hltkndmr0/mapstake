# Cartogram

Dünya haritası üzerinde reklam yerleşimi satan bir pazaryeri. Her ülke ve her il/eyalet ayrı bir reklam alanı; sıralama o bölgeye yapılan **toplam harcamaya** göre belirleniyor. Yarış **kategori içinde** yapılır: bir yazılım markası bir otomotiv markasını geçmek zorunda değil.

**Canlı:** https://world-six-xi.vercel.app

> Bu bir reklam yerleşimi satın alımıdır. Bahis, ödül veya şans oyunu değildir.

---

## Ne yapıyor

Döndürülebilir bir küre üzerinde 241 ülke ve 4.454 il/eyalet var. Bir markanın sahibi bir bölgeye para koyuyor, o bölgedeki toplam harcaması sıralamasını belirliyor. En yüksek toplam #1 oluyor ve markası haritada görünüyor.

- **İki seviyeli envanter.** Ülke ve alt birimleri **ayrı** yarışır. Türkiye'nin #1'i olmak İstanbul'un #1'i olmak demek değildir.
- **Kategori bazlı yarış.** Envanter birimi (bölge × kategori). "Türkiye / Yazılım" ile "Türkiye / Otomotiv" ayrı slotlardır, ayrı liderleri vardır.
- **İki görünüm.** Küre ve `/list`. Liste dünyadan ülkeye, ülkeden ile daralır ve her kombinasyonun kendi adresi vardır.
- **Hesap yok.** Kimlik, gönderilen normalize edilmiş bağlantıdır (`https://www.ornek.com/fiyatlar?x=1` → `ornek.com`).
- **Kümülatif sıralama.** Ödemeler birikir. Geçildiyseniz baştan ödemezsiniz, yalnız aradaki farkı ödersiniz.
- **Paket alım.** İl alırken "ülkeyi de al" seçilirse tek ödeme yapılır — ülke bedeli — ve il pakete dahil gelir.

## Ekran akışı

```
🌍 Dünya           ülkeler KENDİ BAYRAKLARIYLA boyalı, boşlarda $5 fiyat etiketi
   ↓ ülkeye tıkla
🇹🇷 Ülke            il/eyalet katmanı lazy yüklenir, kamera döner, iller
                   ülkenin bayrak renginin soluk tonuyla boyanır
   ↓ ile tıkla
📍 İl paneli        kategori tablosu + sıralama + "ülkeyi de al" + teklif ekranı
```

Üstteki kategori çubuğu bu akışın tamamını filtreler: harita dolguları,
sıralama tablosu ve panel aynı kategoriyi gösterir.

Liste görünümü (`/list`) aynı envanteri metin olarak verir:

```
/list                      dünya sıralaması + kategori kartları + 241 ülke
/list?cat=software         yalnız yazılım yarışı
/list?c=TUR                Türkiye sıralaması + 81 il
/list?c=TUR&cat=automotive Türkiye'nin otomotiv sıralaması
/list?a=TR-34              İstanbul slotunun sıralaması
```

---

## Teknoloji

| Katman | Seçim |
|---|---|
| Framework | Next.js 15 (App Router) + TypeScript |
| Küre | D3 `geoOrthographic` + **inline SVG** (canvas/WebGL yok) |
| Coğrafi veri | Natural Earth 10m admin-1 + 50m admin-0, TopoJSON'a derlenmiş |
| Veritabanı | PostgreSQL (Supabase) — `pg` sürücüsü, transaction pooler |
| Dağıtım | Vercel |
| Ödeme | Whop checkout + imzalı webhook (`lib/whop.ts`, `lib/payments.ts`) |

---

## Mimari kararlar

### Bölgeler tek tabloda

`territories` tablosu hem ülkeyi hem alt birimi tutar, `parent_id` ile bağlanır. Sıralama motoru bu sayede iki seviye için de **aynı kodu** kullanır: `WHERE territory_id = $1`. Ayrı tablo olsaydı her sorgu ikiye katlanırdı.

### Kategori, ayrı tablo değil bir kolon

`placements.category` — birincil anahtarı `slug` olan küçük ve sabit bir
`categories` tablosuna bakar. Sayısal id yerine slug seçilmesinin nedeni:
aynı değer URL parametresinde (`?cat=software`), API gövdesinde ve SQL
filtresinde geçiyor; id olsaydı üç yerde de çözümleme gerekirdi.

Slot artık `(bölge, reklamveren, kategori)`. Eski `UNIQUE (bölge, reklamveren)`
kısıtı aynı markanın iki kategoride yarışmasını engellerdi.

Sıralama sorgusu tek: `AND ($2::text IS NULL OR p.category = $2)`. NULL
geçilince bütün kategoriler tek listede yarışır ("Tümü" görünümü). İki ayrı
sorgu yazmak sıralama kuralını iki yere kopyalamak demekti.

### Sıralama kuralı

```sql
ORDER BY p.total_cents DESC,              -- 1) toplam harcama
         p.reached_current_total_at ASC,  -- 2) eşitse o toplama önce ulaşan
         p.id ASC                         -- 3) deterministik son çare
```

`reached_current_total_at` toplam **değiştiği anda** güncellenir. Bu alan olmadan beraberlik çözümü denetlenebilir olmaz.

### Fiyat otoritesi sunucuda

İstemcinin gönderdiği tutar yalnızca bir *istektir*. Taban fiyat, mevcut toplam ve lideri geçmek için gereken fark her zaman sunucuda yeniden hesaplanır:

```
gereken_ödeme = max(taban, hedef_toplam + 1$ − mevcut_toplamın)
```

`mevcut_toplamın` çıkarması kritik. Bu çıkarma yapılmazsa mevcut yerleşimini büyüten kullanıcı gereğinden fazla öder.

### Hesaplama ile kayıt ayrı

`computeQuote()` hiçbir şey yazmaz — teklif ekranı yazdıkça bunu çağırır. `createIntent()` yalnız gerçek checkout'ta çalışır. Başlangıçta her önizleme bir `intents` satırı yazıyordu; Postgres'e geçince her tuş vuruşu ağ gidiş-dönüşü demek oldu ve checkout gözle görülür şekilde yavaşladı.

### Ödeme idempotent

`payments.provider_event_id` UNIQUE. Aynı webhook olayı kaç kez gelirse gelsin stake bir kez yazılır. Yerleşim satırı `SELECT … FOR UPDATE` ile kilitlenir; aynı bölgeye eşzamanlı iki ödeme geldiğinde toplam kaybolmaz.

### Nakit ≠ yerleşim toplamı

"Total spend" `payments` tablosundan sayılır, yerleşim toplamlarından değil. Paket alımda tek ödeme iki bölgeye kredi olarak işlendiği için yerleşimleri toplamak rakamı şişirirdi. Paket kredisi `stake_events.bundled = TRUE` ile nakitten ayrışır.

### Paylaşım kartı sunucuda üretilir

Her bölgenin `/t/<kod>` adresinde kendi sayfası var ve OG görseli `next/og` ile
o anki sıralamadan üretiliyor. Sayfa ile görsel **aynı sorguyu** (`data.ts`)
kullanır: crawler görseli ayrı bir istekte çeker, iki kaynak olsaydı kart ile
sayfa farklı sıralama gösterebilir ve paylaşım yanlış bilgi taşırdı.

### Kategori paylaşımda YOL parçası, query değil

`/t/TUR/software` — çünkü `opengraph-image` yalnız route parametrelerini görür,
arama parametrelerini görmez. Kategori `?cat=` ile taşınsaydı sayfa
"Türkiye'nin yazılım #1'i" derken kart bütün kategorilerin birleşik lideriyle
çıkardı; paylaşımın kendisi yanlış bilgi olurdu.

Bilinmeyen kategori 404 verir. Sessizce "bütün kategoriler"e düşseydi
`/t/TUR/uydurma` gerçek bir sayfa gibi görünür ve paylaşıldığında başka bir
yarışın liderini gösterirdi.

Kartta emoji **yok**: satori emojiyi ancak dış bir CDN'den (twemoji) çekerek
çizebiliyor ve kart üretimi crawler isteğinin içinde koşuyor. Kategori kimliği
renkli nokta + isimle veriliyor.

`metadataBase` sırayla `NEXT_PUBLIC_SITE_URL` → Vercel production adresi →
`BRAND.domain` olarak çözülür. OG görselleri mutlak URL yayınlandığı için
çözümlenmeyen bir domaine işaret etmesi kartı sessizce boş bırakır.

### Toplulaştırılmış sıralamada da aynı beraberlik kuralı

Liste görünümündeki "dünya sıralaması" tekil bir yerleşim değil, markanın
kapsamdaki **bütün** yerleşimlerinin toplamıdır. Beraberlik burada
`MIN(reached_current_total_at)` ile çözülür — tekil kuraldaki "o toplama önce
ulaşan üstte" ilkesinin toplulaştırılmış karşılığı. Farklı bir kural
seçilseydi harita ile liste aynı iki markayı ters sırada gösterebilirdi.

### Bayraklar kendi origin'imizde

`npm run flags`, `flag-icons` (MIT) setinden yalnız `index.json`'daki
ülkelerin 4x3 SVG'sini `public/flags/` altına kopyalar ve `lib/flag-manifest.json`
eşlemesini üretir. Gerekçe `public/geo` ile aynı: küre üzerinde aynı anda ~200
bayrak isteniyor; üçüncü parti bir host'ta bu, her ziyaretçi için 200
çapraz-origin isteği ve tek bir kesintide "dünyanın yarısı gri" demek.

Küre bayrakları `<pattern patternContentUnits="objectBoundingBox">` ile basar:
bayrak her ülkenin kendi sınır kutusuna oturur. Desenler **tembel ve birikimli**
tanımlanır — yalnız ekranda görünen ve eşiği geçen ülke `<defs>`'e girer,
girdikten sonra çıkarılmaz. 241 bayrağı baştan tanımlamak ilk açılışta 241
istek demekti.

Aksan rengi (`lib/flagColor.ts`) bayraktan çalışma anında çıkarılır: 24 px'e
indirgenip doygunluğu düşük pikseller (beyaz/siyah/gri) elenir, kalan ton
kovalarının en kalabalığı kazanır. Ortalama alınsaydı kırmızı-beyaz bir bayrak
pembeye düşerdi. 238 ülke için elle renk tablosu tutmak hem baştan yanlış hem
bakımsız kalırdı.

### Coğrafi veri build-time'da

Natural Earth verisi indirilip sadeleştirilir, ülke başına ayrı TopoJSON dosyasına bölünür ve kendi origin'imizden sunulur. İstemci yalnız içine girdiği ülkenin dosyasını indirir (8–44 KB); 4.454 poligon asla tek seferde gitmez.

---

## Kurulum

**Gerekli:** Node 20+, bir PostgreSQL veritabanı.

```bash
npm install
```

`.env.local` oluşturun:

```bash
DATABASE_URL="postgresql://kullanici:sifre@host:6543/postgres"
WHOP_API_KEY="..."
WHOP_ACCOUNT_ID="biz_..."
WHOP_WEBHOOK_SECRET="ws_..."
```

Whop dashboard'da `payment.succeeded` olayını
`https://<alan-adiniz>/api/webhooks/whop` adresine gönderen bir webhook oluşturun.
API anahtarı ve webhook secret yalnız sunucu ortamında tutulur; `NEXT_PUBLIC_`
önekli değişkenlere yazılmaz. Yerel mock ödeme yalnız `ALLOW_MOCK_PAY=1` ile açılır.

> Supabase kullanıyorsanız **transaction pooler** adresini (port **6543**) verin, doğrudan bağlantıyı (5432) değil. Serverless fonksiyonlar çok sayıda kısa ömürlü bağlantı açar; doğrudan bağlantıda Postgres'in bağlantı limiti hızla dolar.

Sonra:

```bash
npm run geo      # Natural Earth verisini indirir ve derler (~40 MB indirme, bir kez)
npm run flags    # bayrak SVG'lerini public/flags altına kopyalar
npm run migrate  # şemayı uygular (kategori tablosu ve kolonları dahil, idempotent)
npm run seed     # 241 ülke + 4.454 alt birim + örnek veri
npm run dev
```

Kısayol: `npm run setup` üçünü sırayla çalıştırır.

### Betikler

| Komut | İş |
|---|---|
| `npm run geo` | Natural Earth → sadeleştirilmiş TopoJSON, ülke başına dosya |
| `npm run flags` | `flag-icons` → `public/flags/*.svg` + `lib/flag-manifest.json` |
| `npm run migrate` | `lib/schema.sql`'i uygular (idempotent) |
| `npm run seed` | Bölgeleri yazar, tablo boşsa demo yerleşim ekler |
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Üretim derlemesi |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Birim testleri (`node --test`, tsx ile) |

---

## Dağıtım

Vercel'de barındırılıyor. Tek gereken ortam değişkeni `DATABASE_URL` (ya da Supabase entegrasyonunun eklediği `POSTGRES_URL`).

```bash
vercel deploy --prod
```

`public/geo/` derlenmiş coğrafi veriyi içerir ve repoda tutulur — böylece Vercel build'inde 40 MB'lık indirme tekrarlanmaz.

---

## Proje yapısı

```
app/
  page.tsx                 ana sahne (board sunucuda hazırlanır → "0 / $0" yanıp sönmesi yok)
  list/                    liste görünümü: dünya → ülke → il, kategori bazlı
  rules/  about/           kural ve sorumluluk metinleri
  pay/mock/                geçici ödeme ekranı — sağlayıcı bağlanınca silinecek
  t/[code]/                paylaşılabilir bölge sayfası + OG/Twitter kartı
    [cat]/                 aynı sayfanın kategoriye özel hâli (/t/TUR/software)
  api/
    board · board/children · top · territory · search · activity · stats · categories
    quote                  fiyat hesabı (yazma yok)
    checkout               intent oluşturur + sağlayıcıya yönlendirir
    pay                    yalnız yerel geliştirme için mock ödeme onayı
    webhooks/whop          Whop imza, tutar ve para birimi doğrulaması
    click · icon
components/
  Globe.tsx                D3 projeksiyon, bayrak desenleri, etiket çakışma çözümü
  Stage.tsx                durum yönetimi, kategori filtresi, katman geçişleri
  StakeModal.tsx           teklif ekranı, kategori seçimi, canlı quote, paket
  CategoryBar.tsx          kategori çubuğu (harita)
  Flag.tsx                 bayrak görseli, eksik bayrakta yer tutucu
  TerritorySearch.tsx      haritanın klavye/ekran okuyucu alternatifi
lib/
  db.ts                    pg havuzu, transaction yardımcıları
  schema.sql               tek kaynak DDL (kategori listesi dahil)
  ranking.ts               sıralama, quote, ödeme uygulama
  board.ts                 harita okuma sorguları
  rankings.ts              liste görünümü sorguları (kapsam × kategori)
  categories.ts            kategori okuma + doğrulama
  flags.ts / flagColor.ts  bayrak eşlemesi ve aksan rengi çıkarımı
  normalize.ts             URL/sosyal profil normalizasyonu
  payments.ts              sağlayıcı arayüzü
  brand.ts                 marka metinleri + fiyat politikası (tek kaynak)
scripts/
  build-geo.mjs · migrate.mjs · seed.mjs
tests/
  pricing · normalize · whop-webhook · time · flags
```

---

## Erişilebilirlik

Harita fare/dokunmatik dışında da kullanılabilir olmalı. `TerritorySearch` bunun için var: combobox deseniyle yazarak ara, ok tuşlarıyla gez, Enter ile seç — 4.454 bölgenin tamamı aranabilir. Modallarda odak tuzağı, Escape yalnız en üst katmanı kapatma ve odağın tetikleyiciye dönmesi uygulanmıştır.

## Performans notları

- Sürükleme `requestAnimationFrame`'e hizalanmıştır; her `pointermove` React render tetiklemez.
- Modal veya arama açıkken küre render döngüsü hiç kurulmaz.
- Dar ekranda `backdrop-filter` ve SVG `feDropShadow` filtreleri kapatılır — mobil GPU'da bunlar kaydırmayı gözle görülür şekilde yavaşlatıyordu.
- Aktivite akışı sekme görünmezken durur.

---

## Bilinen sınırlar

- Whop checkout'un çalışması için business hesabı, API anahtarı, account ID ve webhook secret ortam değişkenleri gerekir. `/api/pay` yalnız yerel geliştirme taklididir.
- **Moderasyon yok.** Herkes herhangi bir bağlantı ekleyebiliyor. Şikâyet formu, gizle/engelle aksiyonları ve denetim kaydı lansman öncesi şart.
- **Reklamveren profil sayfaları yok.** (`/brand/<link>` — planlı.)
- **Testler yalnız saf fonksiyonları kapsıyor.** Fiyat matematiği, link
  normalizasyonu, webhook imzası, zaman etiketi ve bayrak eşlemesi test
  altında; veritabanına dokunan `applyPayment`/`computeQuote` ve kategori
  sorguları için test veritabanı gerekiyor.
- **Kategori seçimi moderasyona bağlı değil.** Reklamveren kendi kategorisini
  seçiyor; yanlış kategoriye girmeyi engelleyen bir denetim yok. Şikâyet
  akışıyla birlikte ele alınmalı.
- Natural Earth'te 95 bölge aynı ISO kodunu paylaşıyor (Bosna'nın kantonları hep `BA-BIH`). Aynı kod aynı bölge sayılır; haritadaki tüm parçalar aynı sahibi gösterir.

## Veri ve hukuk

- Sınırlar [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) verisinden türetilmiştir (public domain), **gösterim amaçlıdır** ve siyasi bir beyan değildir.
- İdari birim listeleri ülkelerin düzenlemeleriyle zamanla değişir; veri sürümü pinlenmiştir.
- Listeler kullanıcılar tarafından gönderilir, doğrulanmaz; endorsement anlamına gelmez.
- Ücretli dış bağlantılar `rel="sponsored ugc nofollow noopener noreferrer"` ile işaretlenir.
