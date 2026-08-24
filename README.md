# Mapstake

Dünya haritası üzerinde reklam yerleşimi satan bir pazaryeri. Her ülke ve her il/eyalet ayrı bir reklam alanı; sıralama o bölgeye yapılan **toplam harcamaya** göre belirleniyor.

**Canlı:** https://world-six-xi.vercel.app

> Bu bir reklam yerleşimi satın alımıdır. Bahis, ödül veya şans oyunu değildir.

---

## Ne yapıyor

Döndürülebilir bir küre üzerinde 241 ülke ve 4.454 il/eyalet var. Bir markanın sahibi bir bölgeye para koyuyor, o bölgedeki toplam harcaması sıralamasını belirliyor. En yüksek toplam #1 oluyor ve markası haritada görünüyor.

- **İki seviyeli envanter.** Ülke ve alt birimleri **ayrı** yarışır. Türkiye'nin #1'i olmak İstanbul'un #1'i olmak demek değildir.
- **Hesap yok.** Kimlik, gönderilen normalize edilmiş bağlantıdır (`https://www.ornek.com/fiyatlar?x=1` → `ornek.com`).
- **Kümülatif sıralama.** Ödemeler birikir. Geçildiyseniz baştan ödemezsiniz, yalnız aradaki farkı ödersiniz.
- **Paket alım.** İl alırken "ülkeyi de al" seçilirse tek ödeme yapılır — ülke bedeli — ve il pakete dahil gelir.

## Ekran akışı

```
🌍 Dünya           ülkeler, boş olanlarda $5 fiyat etiketi, dolu olanlarda marka rozeti
   ↓ ülkeye tıkla
🇹🇷 Ülke            o ülkenin il/eyalet katmanı lazy yüklenir, kamera oraya döner
   ↓ ile tıkla
📍 İl paneli        sıralama + "ülkeyi de al" teklifi + teklif ekranı
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
| Ödeme | Henüz bağlı değil — arayüz soyutlaması hazır (`lib/payments.ts`) |

---

## Mimari kararlar

### Bölgeler tek tabloda

`territories` tablosu hem ülkeyi hem alt birimi tutar, `parent_id` ile bağlanır. Sıralama motoru bu sayede iki seviye için de **aynı kodu** kullanır: `WHERE territory_id = $1`. Ayrı tablo olsaydı her sorgu ikiye katlanırdı.

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
```

> Supabase kullanıyorsanız **transaction pooler** adresini (port **6543**) verin, doğrudan bağlantıyı (5432) değil. Serverless fonksiyonlar çok sayıda kısa ömürlü bağlantı açar; doğrudan bağlantıda Postgres'in bağlantı limiti hızla dolar.

Sonra:

```bash
npm run geo      # Natural Earth verisini indirir ve derler (~40 MB indirme, bir kez)
npm run migrate  # şemayı uygular
npm run seed     # 241 ülke + 4.454 alt birim + örnek veri
npm run dev
```

Kısayol: `npm run setup` üçünü sırayla çalıştırır.

### Betikler

| Komut | İş |
|---|---|
| `npm run geo` | Natural Earth → sadeleştirilmiş TopoJSON, ülke başına dosya |
| `npm run migrate` | `lib/schema.sql`'i uygular (idempotent) |
| `npm run seed` | Bölgeleri yazar, tablo boşsa demo yerleşim ekler |
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` | Üretim derlemesi |
| `npm run typecheck` | `tsc --noEmit` |

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
  rules/  about/           kural ve sorumluluk metinleri
  pay/mock/                geçici ödeme ekranı — sağlayıcı bağlanınca silinecek
  api/
    board · board/children · top · territory · search · activity · stats
    quote                  fiyat hesabı (yazma yok)
    checkout               intent oluşturur + sağlayıcıya yönlendirir
    pay                    MOCK ödeme onayı — üretimde imzalı webhook ile değişecek
    click · icon
components/
  Globe.tsx                D3 projeksiyon, sürükleme/zoom, etiket çakışma çözümü
  Stage.tsx                durum yönetimi, katman geçişleri, kamera
  StakeModal.tsx           teklif ekranı, canlı quote, paket seçeneği
  TerritorySearch.tsx      haritanın klavye/ekran okuyucu alternatifi
lib/
  db.ts                    pg havuzu, transaction yardımcıları
  schema.sql               tek kaynak DDL
  ranking.ts               sıralama, quote, ödeme uygulama
  board.ts                 okuma sorguları
  normalize.ts             URL/sosyal profil normalizasyonu
  payments.ts              sağlayıcı arayüzü
  brand.ts                 marka metinleri + fiyat politikası (tek kaynak)
scripts/
  build-geo.mjs · migrate.mjs · seed.mjs
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

- **Ödeme sağlayıcısı bağlı değil.** `/api/pay` yalnız `ALLOW_MOCK_PAY=1` ile çalışan bir taklittir. Üretimde silinip yerine imza doğrulayan webhook gelmelidir; `applyPayment()` aynen kalır.
- **Moderasyon yok.** Herkes herhangi bir bağlantı ekleyebiliyor. Şikâyet formu, gizle/engelle aksiyonları ve denetim kaydı lansman öncesi şart.
- **Reklamveren profil sayfaları yok.** (`/brand/<link>` — planlı.)
- Natural Earth'te 95 bölge aynı ISO kodunu paylaşıyor (Bosna'nın kantonları hep `BA-BIH`). Aynı kod aynı bölge sayılır; haritadaki tüm parçalar aynı sahibi gösterir.

## Veri ve hukuk

- Sınırlar [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) verisinden türetilmiştir (public domain), **gösterim amaçlıdır** ve siyasi bir beyan değildir.
- İdari birim listeleri ülkelerin düzenlemeleriyle zamanla değişir; veri sürümü pinlenmiştir.
- Listeler kullanıcılar tarafından gönderilir, doğrulanmaz; endorsement anlamına gelmez.
- Ücretli dış bağlantılar `rel="sponsored ugc nofollow noopener noreferrer"` ile işaretlenir.
