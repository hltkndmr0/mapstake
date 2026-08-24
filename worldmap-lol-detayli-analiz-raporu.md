# worldmap.lol — ayrıntılı ürün, arayüz ve teknik yeniden yapım raporu

**İnceleme tarihi:** 24 Ağustos 2026  
**İncelenen ürün:** [worldmap.lol](https://worldmap.lol/)  
**Amaç:** Ürünün görülebilen davranışlarını, iş kurallarını ve teknik yapısını çözümlemek; aynı ürün fikrini güvenli, sürdürülebilir ve üretime hazır biçimde yeniden yapmak için uygulanabilir bir spesifikasyon çıkarmak.

> Bu rapor bir “clean-room” yeniden yapım planıdır. Orijinal markayı, metinleri, logoyu veya ayırt edici görsel ifadeyi izinsiz kopyalamayı değil; aynı ürün yeteneklerini özgün marka ve tasarımla kurmayı önerir.

---

## 1. Okuma anahtarı ve kapsam

Rapor boyunca üç güven düzeyi kullanılmıştır:

- **Doğrulandı:** Canlı arayüz, DOM, indirilen istemci paketleri, salt-okunur API yanıtı veya HTTP başlıklarında doğrudan gözlendi.
- **Güçlü çıkarım:** Birden fazla istemci/ağ kanıtından yüksek güvenle çıkarıldı; fakat sunucu kodu görülmedi.
- **Öneri:** Aynısını üretime uygun yapmak için önerilen tasarım; mevcut sitenin gizli backend’i hakkında iddia değildir.

İnceleme şunları kapsadı:

- Masaüstü: 1920×873/929.
- Tablet: 768×1024.
- Mobil dikey: 390×844.
- Mobil yatay: 844×390.
- Ana harita, ülke seçimi, hover, sürükleme, zoom, liderlik, canlı aktivite, bilgi/rules/about modalları ve sayfaları, paylaşılabilir profil rotaları.
- Statik JS/CSS/font/coğrafya paketleri, public GET API’leri, polling davranışı, cache ve güvenlik başlıkları.
- Klavye/focus davranışı, temel erişilebilirlik ve kontrast kontrolleri.
- DNS, TLS, host yönlendirmeleri ve temel performans envanteri.

Bilerek yapılmayanlar:

- Checkout başlatılmadı, ödeme yapılmadı ve yazan endpoint’ler çağrılmadı.
- Whop success/cancel/refund/chargeback/webhook akışları dışarıdan test edilmedi.
- Saldırgan güvenlik taraması, rate-limit zorlama veya form gönderimi yapılmadı.
- Gerçek veritabanı, gizli sunucu kodu, ortam değişkenleri ve operasyon panelleri görülemez.

Canlı teklif, ziyaretçi ve izleyen sayıları inceleme anına ait bir snapshot’tır; kalıcı ürün verisi gibi yorumlanmamalıdır.

---

## 2. Yönetici özeti

worldmap.lol özünde **oyunlaştırılmış bir reklam pazaryeri**dir. Dünya haritasındaki ülkeler reklam envanterine dönüştürülür. Bir startup veya sosyal profil bir ülkeye para yatırır; aynı ülkeye yatırılan kümülatif tutar sıralamayı belirler. En yüksek toplam stake ülkenin harita üzerindeki görünür sahibidir. Ürün bunu “dünya fethetme” metaforu, canlı hareket akışı, global liderlik ve paylaşılabilir marka profilleriyle sunar.

Temel değer döngüsü şöyledir:

1. Ziyaretçi kürede sahipli ve boş ülkeleri görür.
2. Bir ülke seçer veya ana çağrıdan rastgele uygun bir ülkeye gider.
3. Ürün URL’sini ya da desteklenen sosyal profilini girer.
4. Tam dolar tutarında ödeme niyeti oluşturur.
5. Ödeme doğrulandıktan sonra tutar aynı profilin o ülkedeki toplamına eklenir.
6. Sıra değişir; liderse marka favicon’u, adı ve rengi haritada görünür.
7. Harici tıklamalar sayılır; profil sayfası ve liderlik sosyal paylaşım/rekabet yaratır.
8. Rakip geçtiğinde kullanıcı yalnız gerekli farkı yatırarak yeniden lider olmaya teşvik edilir.

### Ürünün güçlü yanları

- Tek bakışta anlaşılabilen, güçlü ve paylaşılabilir bir görsel metafor.
- Hesapsız satın alma akışı; düşük giriş bariyeri.
- Kümülatif stake ve liderlik, tekrar ödeme için doğal teşvik oluşturuyor.
- Harita, canlı aktivite ve üç farklı global liderlik metriği birbirini besliyor.
- Favicon, OG görseli ve otomatik açıklama sayesinde reklam oluşturma yükü düşük.
- Paylaşılabilir `/pin/...` profilleri organik dağılım ve backlink etkisi sağlıyor.

### En önemli mevcut sorunlar

- “Canlı” tahta gerçek zamanlı değil: ana board düzenli poll edilmiyor; aktivite 12 sn, istatistik 30 sn aralıkla yenileniyor.
- İlk yüklemede kısa süreli sahte `0 ülke / $0` durumu gösteriliyor; skeleton/loading yok.
- Ülkeler klavyeyle seçilemiyor; modallarda focus taşıma ve focus trap yok.
- Telefon yatay görünümünde masaüstü breakpoint’i devreye giriyor ve içerik erişilemez biçimde kırpılıyor.
- $2 promosyonu, rules sayfasındaki “ülke başına $5 minimum” anlatımıyla çelişiyor.
- Mevcut bir listing’e top-up yapılırken varsayılan tutar yanlış kalabiliyor ve kullanıcı gereğinden fazla ödeme yapmaya yönlenebiliyor.
- Public aktivite API’si, arayüzün ihtiyacı olmayan ödeme sağlayıcı kimliğini de dönüyor.
- Kök yanıtında CSP, clickjacking savunması ve bazı standart güvenlik başlıkları yok.
- Canonical, robots, sitemap, JSON-LD ve PWA parçaları eksik.

### Yeniden yapım için önerilen çekirdek

- Next.js App Router + TypeScript.
- D3 `geoOrthographic` + SVG + TopoJSON dünya verisi.
- PostgreSQL + transaction tabanlı kümülatif stake/sıralama motoru.
- Whop checkout + imzalı, idempotent webhook.
- Redis/edge cache + SSE veya ölçülü polling.
- Güvenli OG/favicon metadata işleme kuyruğu.
- Moderasyon ve ödeme operasyonu için küçük bir admin paneli.

Gerçekçi efor: üretime yakın ilk sürüm için tek deneyimli full-stack geliştiriciyle yaklaşık **7–10 hafta**; iki kıdemli geliştirici ve yarı zamanlı tasarım/QA ile **4–6 hafta**. Daha yüksek güvenlik, moderasyon ve operasyon olgunluğu hedeflenirse **6–8 haftalık ekip takvimi** daha sağlıklıdır.

---

## 3. Ürünün bilgi mimarisi

### Doğrulanan rotalar

| Rota | İşlev |
|---|---|
| `/` | Tam ekran küre, canlı sayaçlar, aktivite, ülke paneli ve liderlikler |
| `/about` | Ürünün reklam niteliği, kullanıcı içeriği ve sorumluluk reddi |
| `/rules` | Stake, sıralama, URL, ödeme, moderasyon ve iade kuralları |
| `/pin/{listing-key}` | Bir startup/sosyal profil için paylaşılabilir fetih profili |
| Bilinmeyen genel rota | Varsayılan Next.js 404 |
| Listelenmemiş `/pin/{key}` | 404 yerine özel “henüz bayrağı yok” boş durumu |

### Public API yüzeyi

| Uç | Yöntem | Doğrulanan istemci amacı |
|---|---|---|
| `/api/board` | GET | Ülkeler, sıralar, toplam ciro ve aktif ülke sayısı |
| `/api/activity` | GET | Son ödeme/stake hareketleri |
| `/api/stats` | GET | Son 48 saat ziyaretçi ve izleyen sayısı |
| `/api/og?site=` | GET | Site açıklaması/OG görseli metadata’sı |
| `/api/icon?domain=` | GET | Favicon/marka ikonu |
| `/api/pin-og?site=` | GET | Paylaşılabilir profil için dinamik sosyal görsel |
| `/api/checkout` | POST | Checkout URL’si üretme |
| `/api/click` | POST | Harici listing tıklamasını kaydetme |

`/api/checkout` istemci gövdesi şu kavramsal yapıda:

```json
{
  "country": "Spain",
  "owner": "example.com",
  "amount": 7,
  "social": false
}
```

`/api/click` dış bağlantı açılırken `sendBeacon`, yoksa `fetch(..., keepalive: true)` ile owner anahtarını gönderiyor.

---

## 4. Ana sayfa yerleşimi

### Masaüstü

Sayfa tam ekran, tek sahneli ve sayfa scroll’u kapalıdır. Ana katmanlar:

1. Tam viewport SVG küre.
2. Sol üst marka kapsülü.
3. Sol üstte ürün önermesi ve ülke seçme CTA kartı.
4. Sağ üstte üç satırlı canlı istatistik kutusu.
5. Sol altta canlı aktivite kartı.
6. Sağ altta “World Order” ilk 10 paneli.
7. Alt orta kısımda sürükleme/zoom ipucu.
8. Ülke seçildiğinde aynı sağ panel içinde ülke detay/satın alma durumu.

Ana stage yaklaşık `100vw × 100vh`, `min-height: 560px`, `overflow: hidden` davranışındadır. Harita `viewBox="0 0 1100 760"` ve `preserveAspectRatio="xMidYMid slice"` ile viewport’u doldurur.

### Mobil dikey

- Büyük açıklama/CTA kartı 600 px altında gizleniyor.
- Logo ve sayaç üstte kalıyor; kupa ve bilgi küçük ikon düğmelerine dönüşüyor.
- 720 px altında sağ panel, kenarlardan 12 px boşluklu bottom-sheet oluyor.
- Canlı aktivite başlangıçta gizleniyor; alt FAB ile açılıyor.
- World Order paneli ilk yüklemeden kısa süre sonra otomatik açıldığı için 390×844 ekranda 366×532 px alan kaplıyor.
- Panel gizlenince aktivite ve World Order için iki alt kapsül kontrol beliriyor.

### Tablet

768 px genişlik 720 breakpoint’ini aşar; bu nedenle masaüstü düzeni korunur. 385 px panel viewport’un yaklaşık yarısını kaplar. Tablet için ayrı bir orta düzen olmadığı için harita ve CTA alanı sıkışır.

### Mobil yatay — kritik kusur

844×390 genişlikte masaüstü breakpoint’i devreye girer:

- Sahne minimum 560 px yüksekliğe zorlanır fakat body scroll’u kapalıdır.
- Canlı aktivitenin alt kısmı viewport dışında kalır ve erişilemez.
- Sağ panel üst istatistiklerle çakışır.
- Mobil Hide/FAB kontrolleri görünmez.

Yeniden yapımda yalnız `max-width` değil, `max-height` ve orientation koşulları da kullanılmalıdır. Öneri: `@media (max-width: 900px), (max-height: 640px)` altında kompakt/bottom-sheet düzen.

---

## 5. Küre ve harita motoru

### Doğrulanan teknoloji

- Harita Mapbox, Leaflet, Canvas veya WebGL değildir.
- D3 geo modülleriyle çizilen inline SVG’dir.
- TopoJSON, `topojson-client` ile GeoJSON feature’larına çevrilir.
- Veri `world-atlas@2/countries-110m.json` dosyasından gelir.
- İlk CDN jsDelivr, hata halinde unpkg fallback’i vardır.
- Canlı DOM’da 179 SVG `path` görülür; bunların yaklaşık 174’ü ülke durum yollarıdır, kalanlar sphere/graticule/özel tartışmalı katmanlardır.

### Projeksiyon ve başlangıç değerleri

```text
projection: geoOrthographic
scale:      350
translate:  [550, 380]
clipAngle:  90
rotate:     [-14, -38]
zoom range: 280–1600
```

### Katman sırası

Önerilen ve mevcut görsel davranışla uyumlu çizim sırası:

1. Arka plan/sphere.
2. Graticule.
3. Normal ülke yolları.
4. Tartışmalı bölge katmanı.
5. Sahipli ülke marka çipleri.
6. Kampanya rozetleri.
7. Büyük boş ülke isimleri.
8. Hover/preview katmanı.

### Ülke durumları

| Durum | Görsel | Etkileşim |
|---|---|---|
| Boş | Açık gri dolgu, ince gri sınır | Tıklayınca ilk stake paneli |
| Sahipli | Listing favicon’undan türetilmiş pastel renk, beyaz kalın sınır | Tıklayınca ülke sıralaması |
| $2 kampanyası | Sarı/turuncu, pulse ve fiyat rozeti | Düşük minimumlu ilk stake |
| Tartışmalı | Ayrı/dashed stil | Normal satın alma seçimine kapalı |

Antarktika filtrelenir. Taiwan ve Palestine istemci kodunda tartışmalı kümede ele alınır. Crimea benzeri alan için ayrı sabit GeoJSON overlay vardır. Bu kararlar coğrafi/politik beyan gibi sunulmamalı; harita üzerinde açık veri/sınır disclaimer’ı bulunmalıdır.

### Marka rengi üretimi

Sahipli ülke rengi favicon’dan istemci tarafında türetilir:

1. İkon küçük canvas’a, yaklaşık 16×16 çizilir.
2. Tam saydam, neredeyse beyaz ve neredeyse siyah pikseller elenir.
3. Baskın renk bulunur.
4. Doygunluk/parlaklık harita üzerinde okunabilir pastel aralığa çekilir.
5. İkon okunamazsa deterministic fallback renk kullanılır.

Üretim sürümünde bu işlem metadata worker’da yapılıp sonuç veritabanında saklanmalıdır; her ziyaretçide üçüncü taraf ikon çekmek gereksiz ağ, CORS ve gizlilik maliyeti yaratır.

### Etkileşimler

- Pointer drag: boylam/enlem dönüşü.
- İki parmak pinch: zoom.
- Mouse wheel: yaklaşık `0.92/1.08` çarpanla zoom; `280–1600` sınırı.
- Çizimler `requestAnimationFrame` ile birleştirilir.
- Yaklaşık üç saniye etkileşimsizlikten sonra yavaş otomatik dönüş başlar/devam eder.
- `prefers-reduced-motion: reduce` aktifse otomatik dönüş ve animasyonlar kapatılır.
- Panel listesi üzerindeki wheel, haritayı değil paneli kaydırır.
- Arka yüzdeki label/çipler ekran dışına taşınarak gizlenir.

Canlı gözlem “bıraktıktan sonra yavaş hareket” hissi verse de paket kanıtı fiziksel momentumdan çok idle auto-spin davranışını gösterir. Kopyada gerçek inertia istenirse ayrı hız/sürtünme modeli eklenmelidir.

### Hover davranışı

- Sahipli ülke üzerinde yaklaşık 600 ms sonra küçük marka/ülke önizlemesi açılır.
- Mouseleave sonrası yaklaşık 260 ms tolerans vardır; preview’a geçişte yaklaşık 320 ms pencere kullanılır.
- Coarse pointer ve 820 px altı görünümde preview gizlenir.
- Dış linke giden listing’lere `utm_source=worldmap.lol` eklenir ve tıklama sayılır.

### Erişilebilir harita için gerekli fark

Mevcut ülke yollarında `role`, `tabindex`, erişilebilir isim veya klavye handler’ı yoktur. Üretime hazır kopyada:

- SVG path’leri klavye focus’u almalı veya paralel aranabilir ülke listesi sağlanmalı.
- Enter/Space ülkeyi açmalı, ok tuşları komşu/alfabetik ülkeye geçebilmeli.
- Focus görünümü harita üzerinde yüksek kontrastlı olmalı.
- Ekran okuyucuya “ülke, durum, lider, toplam stake, teklifçi sayısı” özetlenmeli.
- Harita dışında “Ülke ara/seç” alternatifi bulunmalı.

---

## 6. Ülke seçimi ve panel durum makinesi

Sağ panel için önerilen durum makinesi:

```text
WORLD_ORDER
   ├─ select empty country  ─→ COUNTRY_EMPTY
   ├─ select owned country  ─→ COUNTRY_OWNED
   └─ select deal country   ─→ COUNTRY_DEAL

COUNTRY_* ─→ open stake ─→ STAKE_MODAL ─→ CHECKOUT_REDIRECT
COUNTRY_* ─→ expand     ─→ COUNTRY_LEADERBOARD_MODAL
```

### Boş ülke

- “Boş bölge” durumu.
- Ülke adı.
- İlk sıra ve minimum fiyat.
- Soru işaretli avatar/placeholder.
- Henüz teklif olmadığı açıklaması.
- İlk listing için CTA.

Normal taban fiyatı $5’tir. Gizli bir ülke (istemci kodunda Iceland) $1 tabana sahiptir.

### Sahipli ülke

- “Sahipli bölge” durumu.
- Teklifçi sayısı ve lider toplamı.
- Sıralı listing satırları; favicon, owner, tutar.
- Lider satırı görsel olarak vurgulanır.
- Yeni listing veya mevcut listing’i yükseltmek için CTA.

### Kampanyalı ülke

- $2 fırsat rozeti.
- `min=2`, varsayılan tutar $2.
- Harita üzerinde pulse ve rozet.

Doğrulanan kampanya seti istemci kodunda: Indonesia, Lesotho, Italy, Niger, Costa Rica, Tajikistan, New Zealand, South Korea. İnceleme anında bazıları zaten sahipli olduğu için sayaçta 6 aktif fırsat görünüyordu. Kampanya motoru statik kod yerine admin tarafından tarih/stock koşuluyla yönetilmelidir.

### Ana CTA’nın davranışı

Ana “ülke seç” çağrısı sabit yaklaşık 30 popüler ülke arasından boş birini seçiyor; uygun yoksa daha geniş boş ülke listesine düşüyor. Aynı oturumda farklı tıklamalarda farklı ülkeler gözlendi. Kopyada bunu açık bir “sürpriz ülke” davranışı veya deterministic öneri olarak tasarlamak daha anlaşılır olabilir.

### Panel genişletme

- Sahipli ülke genişletilince tüm sıralar, stake toplamı, tıklama ve sıra ele geçirme CTA’ları görünür.
- Boş ülke genişletilince modal gövdesi boş ve CTA’sızdır. Bu bir UX boşluğudur; ilk stake CTA’sı modalda da bulunmalıdır.
- Genişletilmiş modal üzerinden stake modalı açılıp Escape’e basıldığında her iki modalın da kapanması, kullanıcının bağlamını kaybettirir. Nested modal kapatma yalnız en üst katmanı kapatmalıdır.

---

## 7. Stake, sıralama ve fiyatlama motoru

### Doğrulanan temel kural

- Sıralama “tek son ödeme”ye değil, **aynı ülke + aynı normalize listing + aynı mod** için tamamlanmış ödemelerin toplamına göre yapılır.
- Tutarlar tam dolar olmalıdır.
- Büyük toplam üst sıradadır.
- Eşit toplamda bu seviyeye önce ulaşan listing üstte kalır.
- Hesap yoktur; aynı normalize link ve aynı URL/social modu yeniden girilerek toplam artırılır.
- Yeni listing lider olmak zorunda değildir; daha düşük tutarla alt sıraya yerleşebilir.
- Lideri geçmek için mevcut en yüksek toplamdan en az $1 fazlası gerekir.

### Örnek

Bir ülkede:

| Listing | Toplam |
|---|---:|
| A | $6 |
| B | $5 |

Yeni C listing’i:

- $5 yatırırsa #3.
- $6 yatırırsa #2; eşitlikte daha geç geldiği için A’nın altında.
- $7 yatırırsa #1.

B tekrar girilip $2 yatırırsa yeni toplamı $7 olur ve liderliğe çıkar.

### Güvenli sıralama anahtarı

Önerilen sıralama:

```sql
ORDER BY cumulative_total DESC,
         reached_current_total_at ASC,
         listing_id ASC
```

`reached_current_total_at`, son başarılı ödeme transaction’ında güncellenir. Bu alan tie-break davranışını denetlenebilir kılar.

### Taban fiyatlar

- Normal ülke: $5.
- Gizli özel ülke: $1.
- Aktif promosyon ülkesi: $2.
- Mevcut listing top-up: istemci kodunda çoğu durumda $2 minimuma düşebiliyor.

Burada canlı bir kural uyuşmazlığı vardır: Rules metni ödeme başına $5 minimum anlatırken, promosyonlar $2 ve mevcut listing top-up UI’ı $2 kabul ediyor. Yeni üründe tek bir fiyat motoru hem UI metnini hem checkout quote’unu hem webhook doğrulamasını beslemelidir.

### Doğrulanan top-up varsayılan tutar kusuru

Modal yeni listing varsayımıyla açıldığında tutar `leader + 1` olarak ayarlanıyor. Kullanıcı daha sonra zaten o ülkede bulunan bir owner yazarsa varsayılan tutar gerekli **farka** yeniden hesaplanmayabiliyor.

Örnek gözlem:

- Listing’in mevcut toplamı $5.
- Ülke lideri $10.
- Lider olmak için gereken yeni ödeme $6.
- Formun varsayılanı $11 kalabiliyor ve yeni toplamı $16 olarak gösteriyor.

Bu, istemeden fazla ödeme riskidir. Doğru quote fonksiyonu:

```text
required_to_take_rank(target_total, existing_total)
  = max(payment_floor, target_total + 1 - existing_total)
```

Owner normalize edildikten ve mevcut toplam bulunduğu anda amount yeniden hesaplanmalı; kullanıcı kendi artırdığı tutarı düşürmek isterse sistem açıkça toplam/rank etkisini göstermelidir.

### Client’a güvenmeme ilkesi

Client’ın gönderdiği `amount`, ülke fiyatı veya mevcut toplam hiçbir zaman otorite değildir. Sunucu checkout öncesi:

1. Ülkeyi ve kampanyayı yeniden okur.
2. Listing’i normalize eder.
3. Mevcut toplamı ve hedef sıralamayı transaction içinde hesaplar.
4. İzin verilen minimumu/para birimini doğrular.
5. Değişmez bir `purchase_intent` ve quote üretir.

Webhook da checkout metadata’sındaki internal intent ile ödeme tutarını birebir eşleştirmelidir.

---

## 8. URL ve sosyal profil normalizasyonu

### Product URL modu

İstemci davranışı:

- Baştaki/sondaki boşluk temizlenir.
- `http://` / `https://` kaldırılarak host normalize edilir.
- Host küçük harfe çevrilir.
- `www.`, `m.` ve `mobile.` benzeri prefix’ler kaldırılır.
- Normal ürünlerde path, query, fragment ve trailing slash atılır; listing anahtarı domain olur.
- Apple App Store linkinde uygulama ID path’i, Google Play’de `id` query’si korunabilen özel durumlar vardır.
- Bir sosyal host Product modunda girilirse Social sekmesine yönlendirme istenir.
- Telegram, WhatsApp, Discord, Signal ve Messenger davet/chat linkleri engellenir.

### Social modu

Doğrulanan destek:

- X/Twitter profil handle’ı; post/system path’leri değil.
- Instagram profil adı; post/reel gibi içerik rotaları değil.
- GitHub kullanıcı veya `kullanıcı/repo`.
- YouTube `@handle`, kanal, user türü profil rotaları; tekil video değil.

Görülen limitler:

- X handle: `[a-z0-9_]{1,15}`.
- Instagram handle: `[a-z0-9_.]{1,30}`.

### Yeniden yapım gereksinimleri

- Normalizasyon tek bir paylaşılan sunucu modülünde yapılmalı; client yalnız önizleme sunmalı.
- Unicode/punycode, homograph, credentials-in-URL, özel port, trailing dot ve mixed-scheme testleri eklenmeli.
- HTTP yönlendirme çözümü client’ın verdiği son hosta güvenmemeli.
- Redirector/kısaltıcılar ve davet linkleri policy ile yönetilmeli.
- Listing’in canonical anahtarı ayrı, kullanıcıya gösterilen URL ve outbound URL ayrı alanlarda tutulmalı.

---

## 9. Stake modalı ve checkout UX’i

### Mevcut modal

- Product URL ve Social profile sekmeleri.
- URL alanı `type=url`.
- Tutar alanı `type=number`, `step=1`, dinamik `min`.
- Girilen tutarın tahmini sırası ve bir sonraki hedef tutarı canlı açıklanır.
- Whop ile güvenli ödeme ve bunun bir reklam satın alımı olduğu belirtilir.
- Rules bağlantısı ve erteleme/kapatma aksiyonu vardır.
- Görünür form kapatma X’i yoktur; Escape, backdrop veya ikincil aksiyon kullanılır.

Teknik eksikler:

- Gerçek HTML `<form>` semantiği yok.
- Input’ların programatik label’ı yok; amount alanının erişilebilir adı bulunmuyor.
- Açılışta focus modal içine taşınmıyor.
- Focus trap yok.
- Mobil input fontu 14 px; iOS Safari otomatik zoom riski.

### Önerilen checkout akışı

```text
1. Ülke + URL/social gir
2. Server normalize/validate
3. Server mevcut listing ve minimum farkı bul
4. Kullanıcıya değişmez quote özeti göster
5. purchase_intent oluştur
6. Whop checkout oluştur ve yönlendir
7. İmzalı webhook ödeme tamamlanmasını işler
8. Intent idempotent transaction ile stake’e dönüşür
9. Board cache invalidation + canlı olay
10. Return URL yalnız başarı bekleme ekranını açar
```

Whop’un resmi webhook rehberi, imza doğrulaması, tekrar gelen olaylar için idempotency ve olay sırasına güvenmeme gereğini vurgular: [Whop webhooks rehberi](https://docs.whop.com/developer/guides/webhooks). Checkout ve ödeme kabul akışının resmi başlangıç noktası: [Whop Accept Payments](https://docs.whop.com/developer/guides/accept-payments).

### Dönüş davranışı

Mevcut istemci `paid=1&country=...&amount=...` query’sini okur; board’u hemen, 2,5 sn ve 5 sn sonra yeniden çeker, kısa bir başarı bildirimi gösterir ve URL’yi temizler. Bu kullanıcı deneyimi için yararlıdır ama ödeme kanıtı değildir.

Kopyada return URL:

- `intent_id` gibi tahmin edilemez bir referans taşımalı.
- Server status endpoint’ini kısa süre poll etmeli veya SSE dinlemeli.
- Webhook tamamlanmadan “ödendi” dememeli.
- Timeout halinde “ödeme doğrulanıyor” durumu ve destek yolu göstermeli.

---

## 10. World Order ve global liderlikler

### World Order paneli

Sağ alttaki varsayılan panel, en çok stake edilen ilk 10 yerleşimi gösterir:

- Sıra.
- Favicon/avatar.
- Listing adı.
- Kısa açıklama/pitch.
- Stake toplamı.
- Expand.

Liste kendi içinde scroll olur. Genişletilmiş modal, ülke, click sayısı ve ilgili sırayı geçmek için gereken tutarı da gösterir.

“World Order”, sadece ülke liderlerini değil server’ın `winning` dizisindeki yerleşimleri stake’e göre sıralayan bir vitrin izlenimi verir. Backend kontratı açık isimlerle tanımlanmalıdır: `top_country_positions` veya `top_stakes`; `winning` fazla belirsizdir.

### “The board” global metrikleri

Kupa modalında üç sekme vardır:

| Sekme | Hesap |
|---|---|
| Crowns | Listing’in #1 olduğu ülke sayısı |
| Placements | Listing’in bulunduğu toplam ülke/sıra sayısı |
| Spent | Listing’in tüm ülkelerdeki toplam tamamlanmış stake’i |

Her sekmede ilk 10 gösterilir. Eşitlikte toplam harcama ikincil sıralama gibi kullanılıyor. Satırlar `/pin/{listing-key}` profil sayfasına gider.

Öneri: Aynı aggregate view aşağıdaki alanları üretmeli:

```text
listing_id
crowns_count
placements_count
total_spent
countries_count
total_clicks
last_activity_at
```

---

## 11. Canlı aktivite ve istatistikler

### Aktivite kartı

- Masaüstünde sol altta, mobilde açılır bottom-sheet.
- Son beş hareket görünür; API örneği altı kayıt döndürmüştür.
- Satırda favicon, listing, ülke içindeki yeni sıra, tutar ve göreli zaman vardır.
- Alt bölümde son 48 saat ziyaretçisi ve izleyen sayısı bulunur.
- Harici linklere UTM eklenir.

### Yenileme frekansı

| Veri | Mevcut davranış |
|---|---|
| Board | İlk mount’ta bir kez; ödeme dönüşünde 0/2,5/5 sn |
| Aktivite | Hemen ve her 12 sn |
| Stats | Hemen ve her 30 sn |

WebSocket veya SSE gözlenmedi. Bu nedenle başka kullanıcının normal ödemesi ana board’a aynı açık sekmede hemen yansımayabilir; aktivite “canlı”, harita ise tam canlı değildir.

### İzleyen sayısı

İstemci, API’den gelen `watching` değerine sabit `+3` ekliyor. Bu güven/ölçüm açısından kaldırılmalıdır. İzleyen metriği gerçekten gerekiyorsa kısa TTL’li presence heartbeat veya anonim aktif bağlantı sayısı kullanılmalıdır.

### Ölçekleme hesabı

Aktivite 12 sn ve stats 30 sn polling, açık sekme başına yaklaşık:

```text
1/12 + 1/30 = 0,1167 istek/sn
```

1.000 açık sekmede yaklaşık 117 istek/sn üretir; mevcut uçlar `no-store`dur. Öneri:

- `document.visibilityState !== 'visible'` iken polling’i durdur.
- Hata halinde exponential backoff + jitter.
- Stats için 10–30 sn edge cache.
- Board/activity için SSE veya tek birleşik incremental feed.
- Reconnect sonrası version/cursor ile kaçırılan olayları getir.

### Veri minimizasyonu

`/api/activity` yanıtı public olarak `whop_payment_id` alanı da taşıyor; UI bunu işlevsel olarak kullanmıyor. Gizli credential olmasa bile gereksiz ödeme sağlayıcı referansıdır ve public sözleşmeden çıkarılmalıdır.

---

## 12. Paylaşılabilir listing profili

`/pin/{listing-key}` sayfası bir startup/sosyal profil için paylaşılabilir vitrin sunar:

- Kapak görseli.
- Favicon/avatar.
- OG tabanlı başlık/açıklama.
- Harici siteyi ziyaret etme CTA’sı.
- Ülke, #1, placement ve click özetleri.
- Her territory için ülke kartı ve tam sıralama.
- Haritaya dönüp yeni ülke alma CTA’sı.
- Public/user-submitted içerik disclaimer’ı.
- Dinamik Open Graph/Twitter görseli `/api/pin-og?site=...`.

Gözlenen unvanlar veri anına göre:

- Crown yok: Challenger.
- Bir crown: Sovereign.
- İki crown: Conqueror.

Bu eşiklerin tamamı doğrulanamadı; kopyada açık bir gamification tablosu tanımlanmalı.

Listelenmemiş key için özel boş durum gösterilir; bilinmeyen genel rota ise markasız varsayılan Next 404’tür. Yeni uygulamada 404 de markalı, navigasyonlu ve aramaya dönüşlü olmalıdır.

SEO metninde tekil/çoğul dilbilgisi kusurları gözlendi. Bütün profil metadata’sı ICU/plural rules ile üretilmelidir.

---

## 13. Bilgi, About ve Rules içeriği

### Ürün açıklama modalı

Dört kavramı anlatır:

- Claim: boş ülkeye ilk reklamı yerleştirme.
- Stake: sıranın toplam ödeme ile belirlenmesi.
- Reclaim: daha önceki toplam korunarak yalnız farkı tamamlama.
- Hold: rakip geçene kadar marka görünürlüğünün devamı.

Natural Earth/world-atlas kaynağı ve sınırların politik beyan olmadığı notu bulunur. $2 promosyon sistemi burada anlatılmamaktadır.

### About

- Haritanın public/reklam amaçlı olduğu.
- Listing’lerin kullanıcılarca gönderildiği.
- Listing’in endorsement, verification veya affiliation anlamına gelmediği.
- Harici içeriklerden sorumluluk alınmadığı.
- Sorun bildirimi ve kaldırma talebi için iletişim.

### Rules

- Bu bir reklam satın alımıdır; bahis, ödül veya payout yoktur.
- Tam dolar stake; rank kümülatif toplamdır.
- Eşitlikte önce gelen önde kalır.
- Hesap yok; aynı normalize kimlikle top-up yapılır.
- Desteklenen/engellenen URL ve sosyal profil türleri.
- İçerik moderasyonu ve kaldırma hakkı.
- Ödemelerin genel olarak final/no-refund anlatımı.
- Whop ödeme sağlayıcısı.
- As-is ve sorumluluk sınırlaması.

Canlı tutarsızlıklar:

- Rules normal minimumu $5 ve yalnız tek gizli istisna gibi sunarken $2 promosyon ülkeleri aktiftir.
- Mevcut listing top-up istemcide $2 minimuma düşebilir.
- Kampanyalı boş ülke açıklamasının bazı yerlerinde hâlâ $5 metni görünür.
- Küçük bir boşluk/dilbilgisi hatası vardır.

Yeni üründe pazarlama metinleri fiyat motorundan türetilmeli; hard-coded sayı kullanılmamalıdır.

---

## 14. Görsel tasarım sistemi

### Doğrulanan temel renk token’ları

```css
--bg:          #F2F7FC;
--ink:         #1F2B3E;
--muted:       #8494AB;
--line:        #E4EBF3;
--sun:         #FFC93C;
--sun-dark:    #E8AC12;
--sun-deep:    #B8860B;
--red:         #FF6B6B;
--red-dark:    #E04B4B;
--green:       #4CC077;
--gray-land:   #DCE3EB;
--gray-stroke: #C3CDD9;
```

### Tipografi

- Display: Fredoka.
- Gövde: Nunito.
- Mikro/oyun arayüzü etiketi: Press Start 2P.
- Fontlar WOFF2, `font-display: swap`; üç Latin subset preload ediliyor.

### Görsel dil

- Yumuşak mavi-gri zemin.
- Beyaz kartlar, büyük radius ve hafif gölge.
- Sarı ana CTA; turuncu deal; yeşil canlılık.
- Kalın, dost canlısı yuvarlak tipografi.
- Piksel fontla “arcade/territory game” hissi.
- Favicon’larla kişiselleşen pastel ülkeler.
- Küçük caps/mikro etiketler ve emoji destekli rozetler.

### Motion

- Kürenin idle auto-spin’i.
- Deal ülkelerinde yaklaşık 2,2 sn pulse.
- Panel/bottom-sheet slide.
- Hover brightness.
- Otomatik panel açılışı yaklaşık 1,4 sn.
- Reduced-motion ile genel animasyon/transition azaltımı.

### Özgün tasarım önerisi

İşlevsel modeli koruyup şu alanlarda ayrışmak gerekir:

- Farklı isim, logo ve metin tonu.
- Farklı kart geometrisi, ikon sistemi ve harita paleti.
- Ülke sahipliğini yalnız renk değil desen/rozetle de anlatma.
- World Order yerine özgün leaderboard dili.
- Daha erişilebilir tipografi ve kontrast.
- Mobilde haritayı önceleyen daha hafif, kullanıcı kontrollü sheet.

---

## 15. Loading, hata ve boş durumlar

### Mevcut davranış

- SSR kabuğu 0 ülke, $0 ve boş leaderboard ile gelir.
- Aktivite yaklaşık 0,7 sn; gerçek stats/board yaklaşık 1,5 sn sonra dolabilir.
- Spinner veya skeleton yoktur; geçici sıfırlar gerçekmiş gibi görünür.
- Board/API hataları çoğunlukla sessizce yutulur; ilk değerler kalabilir.
- Harita verisi jsDelivr’dan yüklenemezse unpkg denenir.
- İki CDN de başarısızsa internet gerektiğini söyleyen fallback metni vardır.
- OG metadata için loading→image/description fallback zinciri vardır.
- İkonlar DuckDuckGo/Google/unavatar benzeri fallback’lere gider.
- Boş profil için özel CTA, genel 404 için varsayılan Next ekranı vardır.

### Olması gereken durum matrisi

| Alan | Loading | Empty | Error | Retry |
|---|---|---|---|---|
| Board | Skeleton + eski cache | Henüz stake yok | Son cache + uyarı | Otomatik/backoff + manuel |
| Map data | Hafif globe placeholder | Uygulanmaz | Erişilebilir ülke listesi | CDN/self-host retry |
| Activity | 3 skeleton satır | Henüz hareket yok | Kartı gizleme + durum | Backoff |
| Stats | `—` | 0 gerçek değer | `—` + tooltip | Kısa cache |
| Metadata | Domain placeholder | Açıklama yok | Güvenli generic card | Queue retry |
| Payment | Doğrulanıyor | Uygulanmaz | Destek/ref no | Status retry |

Sıfır yalnız API gerçekten sıfır döndürdüğünde gösterilmelidir.

---

## 16. Teknik mimari keşfi

### Doğrulanan stack

- Hosting/CDN: Vercel.
- Framework: Next.js App Router `15.5.23`.
- UI runtime: React/React DOM `19.2.0-canary-0bdb9206-20250818`.
- Render: prerender edilmiş RSC/HTML kabuğu + client harita/state.
- Harita: D3 geo + inline SVG.
- Coğrafya: topojson-client + world-atlas 110m.
- Ödeme izi: Whop.
- Analitik: DataFast.
- Avatar/favicon/metadata: unavatar, DuckDuckGo/Google favicon ve listing origin’leri.
- CSS: tek büyük, semantik sınıf adlı paket; Tailwind izi yok.

React canary sürümü bir gereksinim değildir. Yeniden yapımda stabil Next.js/React kullanmak bakım riskini düşürür.

### Cache modeli

- Kök HTML: prerender, Vercel CDN HIT, stale time sinyali yaklaşık 300 sn.
- Hash’li JS/font: 1 yıl immutable.
- World atlas: CDN cache.
- Live API’ler: `Cache-Control: no-store`, örnekte Vercel MISS.
- OG PNG: CDN HIT fakat `must-revalidate`.

### İlk yük varlık envanteri

Avatar, remote OG ve değişken API gövdeleri hariç yaklaşık:

| Kalem | Wire | Çözülmüş |
|---|---:|---:|
| Uygulama JS | 141,4 KiB | 457,9 KiB |
| CSS | 13,0 KiB | 69,5 KiB |
| 3 WOFF2 | 71,8 KiB | Aynı |
| World atlas | 37,5 KiB | 105,2 KiB |
| DataFast | 5,1 KiB | 15,0 KiB |
| HTML | 4,2 KiB | 14,3 KiB |
| Çekirdek toplam | **273,8 KiB** | **733,2 KiB** |

Toplam 54 kaynak, 36 image ve 179 SVG path gözlenmiştir. Paylaşım `og.png` dosyası 1200×630 ve yaklaşık 1,62 MB’tır; initial kullanıcı render’ında yüklenmese de crawler maliyeti için gereğinden büyüktür.

### DOM yoğunluğu

Ana sayfada yaklaşık:

- 923 element.
- 179 SVG path.
- 34 image.
- 40 link.
- 30 button.
- Yalnız `aside` landmark; `main/header/nav/footer` yok.
- Klavyeyle odaklanabilir ülke sayısı: 0.

---

## 17. Önerilen üretim mimarisi

```text
Browser
  ├─ Next.js UI / D3 SVG globe
  ├─ Query cache + SSE client
  └─ Accessible country search/list
         │
         ▼
Next.js API / BFF
  ├─ Board read model ───── Redis/edge cache
  ├─ Quote + checkout ───── Whop API
  ├─ Webhook processor ──── idempotency + transaction
  ├─ Activity/SSE ───────── event stream
  ├─ Click ingestion ────── buffered analytics
  └─ Metadata service ───── queue + safe fetch worker
         │
         ▼
PostgreSQL
  ├─ countries / campaigns
  ├─ listings / country_positions
  ├─ purchase_intents / payments / stake_events
  ├─ clicks / activity
  ├─ metadata_cache
  └─ reports / moderation_actions / audit_log
```

### Neden event + read model?

Ödeme olayını değişmez `stake_event` olarak saklamak, hem audit hem refund/chargeback hem yeniden hesaplama sağlar. Harita için her istekte bütün event’leri toplamak yerine `country_positions` ve `leaderboard_aggregates` read model’i transaction/worker ile güncellenir.

### Önerilen bileşenler

**Frontend**

- `GlobeMap`
- `HudHeader`
- `LiveStats`
- `ActivityFeed`
- `WorldOrderPanel`
- `CountrySheet`
- `CountryLeaderboardDialog`
- `StakeDialog`
- `GlobalBoardDialog`
- `HowItWorksDialog`
- `ListingProfilePage`
- `CountrySearch` erişilebilir alternatifi

**Backend**

- `NormalizationService`
- `PricingService`
- `RankingService`
- `CheckoutService`
- `WebhookService`
- `MetadataFetchService`
- `BoardProjectionService`
- `PresenceService`
- `ModerationService`

---

## 18. Önerilen veri modeli

### `countries`

| Alan | Not |
|---|---|
| `id`, `iso_numeric`, `iso2`, `slug`, `name` | World atlas eşlemesi |
| `selectable` | Tartışmalı/kapalı durum |
| `base_price_cents` | Normal minimum |
| `status` | active/disabled |

### `campaigns`

| Alan | Not |
|---|---|
| `country_id` | Hedef ülke |
| `price_cents` | Kampanya minimumu |
| `starts_at`, `ends_at` | Zaman aralığı |
| `inventory_limit` | İsteğe bağlı |
| `active` | Admin kontrolü |

### `listings`

| Alan | Not |
|---|---|
| `id` | Internal UUID |
| `mode` | product/social |
| `canonical_key` | Normalize eşsiz anahtar |
| `display_url`, `outbound_url` | Gösterim ve gerçek hedef |
| `title`, `description` | Metadata/moderasyon sonucu |
| `favicon_url`, `image_url`, `brand_color` | Cache’lenmiş medya |
| `moderation_status` | pending/approved/hidden/blocked |

Unique: `(mode, canonical_key)`.

### `country_positions`

| Alan | Not |
|---|---|
| `country_id`, `listing_id` | Unique çift |
| `cumulative_cents` | Tamamlanmış net toplam |
| `reached_current_total_at` | Tie-break |
| `rank_cache` | Opsiyonel read model |
| `click_count` | Cache/aggregate |

### `purchase_intents`

| Alan | Not |
|---|---|
| `id`, `country_id`, `listing_id` | Quote kimliği |
| `quoted_amount_cents`, `currency` | Server otoritesi |
| `existing_total_cents` | Audit snapshot |
| `target_rank` | UX/audit |
| `provider_checkout_id` | Whop eşlemesi |
| `status`, `expires_at` | created/paid/expired/cancelled |

### `payments` ve `stake_events`

- `provider_event_id UNIQUE` idempotency için.
- Provider payment ID public API’ye çıkarılmaz.
- Brüt/net tutar, currency, status, raw payload hash, received_at.
- `stake_event` append-only; payment/refund/chargeback tipleri.
- Projection mevcut toplamı net event’lerden hesaplar.

### Diğer tablolar

- `outbound_clicks`: listing, country bağlamı, timestamp, anonim session hash.
- `activity_events`: public feed için sanitize edilmiş olay.
- `metadata_cache`: kaynak, status, ETag, expiry, güvenli local asset.
- `reports`: kullanıcı şikâyeti, gerekçe, kanıt.
- `moderation_actions`: hide/unhide/block/edit ve actor.
- `audit_log`: fiyat/kampanya/ödeme operasyonu.

---

## 19. Önerilen API sözleşmeleri

### Read uçları

```text
GET /api/v1/board?version=
GET /api/v1/countries/{slug}
GET /api/v1/activity?cursor=&limit=
GET /api/v1/stats
GET /api/v1/listings/{key}
GET /api/v1/events          (SSE)
```

Board yanıtı:

```json
{
  "version": 1842,
  "generatedAt": "2026-08-24T13:05:00Z",
  "totals": {
    "raisedCents": 9900,
    "activeCountries": 15,
    "activeDeals": 6
  },
  "countries": [
    {
      "slug": "spain",
      "state": "owned",
      "minimumCents": 500,
      "leader": {
        "listingKey": "example.com",
        "totalCents": 600,
        "brandColor": "#..."
      },
      "positionsCount": 2
    }
  ]
}
```

Public yanıtlar provider ID, raw payment payload, e-posta, IP veya internal moderation notu içermemelidir.

### Write uçları

```text
POST /api/v1/quote
POST /api/v1/checkout
POST /api/v1/webhooks/whop
POST /api/v1/clicks
POST /api/v1/reports
```

`quote` listing’i normalize eder ve şunları döner:

```json
{
  "quoteId": "...",
  "canonicalListing": "example.com",
  "existingTotalCents": 500,
  "paymentFloorCents": 200,
  "suggestedAmountCents": 600,
  "projectedTotalCents": 1100,
  "projectedRank": 1,
  "expiresAt": "..."
}
```

`checkout` yalnız geçerli, süresi dolmamış quote ID almalı; fiyatı client gövdesinden yeniden kurmamalıdır.

---

## 20. Ödeme, eşzamanlılık ve webhook doğruluğu

### Transaction gereksinimi

İki kişi aynı ülkenin liderliği için aynı anda ödeme yapabilir. “Checkout açıldığı andaki sıra” garanti değildir. Sistem:

- Satın alınan şeyi “kalıcı #1 garanti” değil, belirtilen tutarın kümülatif stake’e eklenmesi olarak tanımlamalı.
- Webhook geldiğinde ödeme tutarını event olarak eklemeli.
- Yeni rank’i o anda hesaplamalı.
- UI’da checkout öncesi sıranın ödeme tamamlanana kadar değişebileceğini söylemeli.

### Idempotency

```text
BEGIN;
  INSERT payment(provider_event_id, ...)
    ON CONFLICT DO NOTHING;
  if inserted:
    INSERT stake_event(...);
    UPSERT country_position(...);
    INSERT sanitized_activity_event(...);
COMMIT;
invalidate board;
publish SSE event;
```

### Refund/chargeback

Rules “final” dese bile provider refund veya chargeback operasyonu mümkündür. Data modeli negatif/reversal event’i desteklemeli; toplam ve liderlik yeniden hesaplanmalıdır. Moderasyonla kaldırılan listing’in para/visibility statüsü ayrı tutulmalıdır.

### Mutabakat

- Günlük provider payment ↔ local payment reconciliation.
- Unmatched webhook/intent alarmı.
- Duplicate event metriği.
- Board projection lag metriği.
- Manuel reprocess ve audit trail.

---

## 21. Metadata, ikon ve SSRF güvenliği

Kullanıcı kontrollü domain’den OG ve ikon toplamak, dikkatli yapılmazsa SSRF ve kaynak tüketimi riski taşır. Mevcut sitenin açık olduğu iddia edilmiyor; dışarıdan sunucu savunması doğrulanamadı.

Gerekli kontroller:

- Yalnız `http`/`https`; credentials, `file:`, `data:`, custom scheme yasak.
- DNS çözümünden sonra loopback, private, link-local, multicast, reserved ve cloud metadata IP’lerini engelle.
- Her redirect’te host/IP’yi yeniden doğrula; redirect sayısını sınırla.
- DNS rebinding’e karşı connect edilen IP’yi doğrulanmış IP’ye pinle.
- 2–5 sn connect/total timeout.
- HTML ve image için sıkı byte limiti.
- MIME sniff + allowlist; SVG’yi sanitize et veya güvenli raster’a çevir.
- Worker’ın internete çıkışını egress proxy/firewall ile sınırla.
- Sonucu kendi object storage/CDN’inde yeniden encode ederek sun.
- Domain ve IP başına rate limit, queue concurrency limiti, negative cache.
- OG metnini sanitize et, uzunluk sınırı uygula.

Client’ın doğrudan reklamveren origin’lerinden image yüklemesi ziyaretçi IP/referrer bilgisini üçüncü tarafla paylaşabilir. Server-side cache proxy bunu azaltır.

---

## 22. Güvenlik, gizlilik ve moderasyon

### Doğrulanan olumlu noktalar

- HTTPS ve HTTP→HTTPS 308.
- TLS 1.3 ve HSTS.
- Hash’li statik varlıklarda uzun immutable cache.
- Gözlenen dış yeni sekme linklerinde `noopener noreferrer`.
- React metin escape davranışı.
- Açılışta konsolda görünür error/warning gözlenmedi.

### Eksik görülen başlıklar

Kök HTML örneğinde görünmeyenler:

- `Content-Security-Policy`.
- `frame-ancestors` veya X-Frame-Options.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy`.
- `Permissions-Policy`.
- COOP/COEP/CORP.

DataFast betiği üçüncü taraf origin’den SRI olmadan yüklenir. Kopyada mümkünse self-host edilmiş/sabitlenmiş analytics veya dar CSP kullanılmalıdır.

Önerilen minimum başlık yaklaşımı:

```text
Content-Security-Policy: default-src 'self'; ...; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Gerçek CSP, kullanılan Whop/analytics/image origin’lerine göre nonce/hash ile tasarlanmalıdır; körlemesine kopyalanmamalıdır.

### UGC ve reklam linkleri

Kullanıcı tarafından satın alınmış outbound linklerde `rel="ugc sponsored noopener noreferrer"` önerilir. Mevcut linklerde `noopener noreferrer` görülürken `ugc/sponsored` görülmemiştir.

### Analitik ve consent

DataFast istemci betiğinde full href/referrer, viewport, dil, timezone, visitor/session ID ve reklam tıklama kimlikleri işlenir. Uzun ömürlü visitor ve kısa session cookie kodu vardır; görünür consent/tercih UI’ı gözlenmedi. Hedef pazara göre privacy notice, consent/CMP, retention ve opt-out tasarlanmalıdır.

### Moderasyon zorunluluğu

Bu ürün ücretli kullanıcı içeriğini ana sayfanın merkezinde yayımlar. Gerekenler:

- Yasak içerik/kategori politikası.
- Domain/profile denylist ve kötü amaçlı URL taraması.
- Marka taklidi/phishing raporu.
- Telif/marka kaldırma süreci.
- Otomatik ve manuel review queue.
- “Gizle”, “blokla”, “metadata’yı düzelt”, “ödemeyi incele” admin aksiyonları.
- Her aksiyon için audit trail ve itiraz/iletişim yolu.

---

## 23. Erişilebilirlik denetimi

### Olumlu

- `<html lang="en">`.
- Ana SVG’nin genel rolü ve adı var.
- Close/Expand/Back/How it works gibi ikon düğmelerinde aria-label’ler var.
- Modallarda `role=dialog`, `aria-modal=true`.
- Escape/backdrop kapatma.
- Reduced-motion desteği.

### Kritik sorunlar

1. **Ülkeler klavye ile erişilemez.** Haritanın ana ürün işlevi mouse/touch’a bağımlı.
2. **Modal focus yönetimi yok.** Açılınca focus tetikleyicide kalıyor; Tab arka sayfaya çıkıyor; kapanınca güvenilir biçimde tetikleyiciye dönmüyor.
3. **Dialog adı yok.** `aria-labelledby`/`aria-describedby` bağları eksik.
4. **Form label’ları yok.** Özellikle amount input’un erişilebilir adı bulunmuyor.
5. **Yapısal landmark eksik.** Ana sayfada h1/h2/main/nav/header/footer gözlenmedi.
6. **Aşırı aria-live.** Büyük aside panelinin tamamı `aria-live=polite`; değişimde uzun ve gürültülü duyuru riski.
7. **Mobil yatay kırpılma.** Bazı içeriklere erişilemiyor.

### Kontrast

CSS token’larından hesaplanan bazı oranlar:

| Eşleşme | Oran | Sonuç |
|---|---:|---|
| `#8494AB` / `#F2F7FC` | 2,86:1 | Küçük metin AA değil |
| `#8494AB` / beyaz | 3,09:1 | Küçük metin AA değil |
| Beyaz / `#FF6B6B` | 2,78:1 | Küçük metin AA değil |
| Beyaz / `#D9744E` | 3,20:1 | Küçük metin AA değil |
| `#1F2B3E` / zemin | ~13,23:1 | Güçlü |

Hedef: WCAG 2.2 AA; normal metinde 4,5:1, büyük metinde 3:1 ve interaktif bileşenlerde görünür focus.

### Kabul kriterleri

- Axe kritik/ciddi ihlal yok.
- Bütün satın alma akışı yalnız klavyeyle tamamlanabilir.
- Her dialog focus alır, trap uygular, Escape yalnız üst dialogu kapatır ve focus’u tetikleyiciye döndürür.
- Ülke arama/liste alternatifi ekran okuyucuda tam işlevli.
- 200% zoom ve 320 CSS px’de yatay sayfa taşması yok.
- VoiceOver/Safari ve NVDA/Chrome temel smoke testi.

---

## 24. SEO, paylaşım ve PWA

### Mevcut SEO

Var:

- `lang`.
- Title/description.
- Open Graph ve Twitter large image metadata.
- 1200×630 sosyal görsel.
- Favicon ve viewport.

Eksik/sorunlu:

- Canonical yok.
- `robots.txt` ve `sitemap.xml` gerçek 404.
- JSON-LD yok.
- `www` ve apex ayrı ayrı 200; yönlendirme/canonical yok.
- Ana H1/H2 ve semantik içerik yapısı yok.
- OG PNG yaklaşık 1,62 MB.
- Genel 404 markasız.

Öneri:

- Apex veya www tek canonical host; diğerinden 308.
- Root ve her public pin profiline canonical.
- Dynamic sitemap: indexlenebilir listing profilleri + statik sayfalar.
- Robots policy; admin/API/checkout rotalarını engelle.
- `WebSite`, `Organization` ve uygun `ProfilePage`/`ItemList` JSON-LD.
- OG görsellerini AVIF/WebP değil, bot uyumluluğu için optimize PNG/JPEG ile yüzlerce KB altına çek.
- Liste profilleri moderasyon onayı sonrası indexlenmeli; boş profiller `noindex`.

### PWA

Manifest, theme-color, apple-touch-icon, service worker ve offline fallback gözlenmedi. Aynı ürünü yapmak için PWA şart değildir. Eklenirse canlı board için cache’in stale veri gösterdiği açıkça işaretlenmelidir.

---

## 25. Performans iyileştirme planı

### Hızlı kazanımlar

- OG görselini küçült.
- Harita JSON’unu kendi origin/CDN’inde versiyonla; üçüncü taraf fallback’i yalnız yedek yap.
- Favicon/avatar/OG’leri normalize edilmiş kendi image CDN’inden sun.
- İlk board verisini server component içine hydrate et; 0/$0 flash’ını kaldır.
- Font preload’u gerçekten above-the-fold olanlarla sınırla.
- Görünmez sekmede polling’i durdur.
- Stats’i kısa süre edge cache’le.

### Harita render

110m geometri ve ~179 path için SVG makuldür. Optimizasyon:

- Projection update’lerini tek rAF içinde birleştir.
- Label/çip ölçülerini önceden hesapla.
- DOM’a yalnız görünür ön yüz label’larını bağla veya transform ile gizlerken layout maliyetini ölç.
- Düşük güçlü cihazlarda auto-spin FPS’ini 30’a veya interval tabanlı küçük adımlara indir.
- Büyük veri/marker sayısı hedeflenirse Canvas/WebGL değerlendirilir; mevcut ölçek için zorunlu değildir.

### Ölçülecek SLO’lar

- LCP p75 < 2,5 sn.
- INP p75 < 200 ms.
- CLS p75 < 0,1.
- Board API p95 < 300 ms cached, < 800 ms uncached.
- Checkout oluşturma p95 < 2 sn.
- Webhook→board görünürlüğü p95 < 3 sn.
- Metadata worker success > %98, timeout kontrollü.

---

## 26. Gözlenen kusurlar ve önceliklendirme

### P0 — ödeme/doğruluk

- Top-up varsayılanı mevcut toplamı düşmeden gereğinden yüksek ödeme önerebiliyor.
- Client fiyatına güvenilirse yarış/amount manipülasyonu riski; server quote zorunlu.
- Return query ödeme kanıtı olarak kullanılmamalı; webhook otoritesi şart.
- Fiyat/rules/promo/top-up minimumları tek kurala bağlı değil.

### P1 — temel kullanılabilirlik/güvenlik

- Ülke seçimi klavyeyle mümkün değil.
- Modal focus yönetimi yok.
- Mobil yatayda içerik kırpılıyor.
- Public API’de gereksiz provider payment ID.
- Metadata/icon fetch’i için SSRF savunması doğrulanamıyor; kopyada tasarım gereksinimi.
- Ücretli UGC linklerinde `sponsored/ugc` rel eksik.
- CSP/clickjacking/nosniff/referrer başlıkları eksik.

### P2 — ürün kalitesi

- Initial 0/$0 flash.
- Board tam canlı değil.
- Boş ülke expanded modalında CTA yok.
- Nested Escape iki modalı birden kapatıyor.
- Mobil default panel haritayı fazla örtüyor.
- Tablet için ara breakpoint yok.
- Kontrast ve küçük piksel yazılar.
- “watching +3” güven problemi.

### P3 — büyüme/teknik hijyen

- Canonical/robots/sitemap/JSON-LD yok.
- www/apex duplicate.
- Büyük OG PNG.
- Markasız 404.
- PWA/offline yok.
- Küçük copy/plural hataları.

---

## 27. Uygulama fazları ve efor

Tahmin, özgün görsel tasarımın hazır olduğu; ödeme sağlayıcı hesabı ve yasal metin onayının zamanında geldiği varsayımıyla mühendislik günüdür.

| Faz | Çıktı | Efor |
|---|---|---:|
| 0. Ürün/clean-room spesifikasyon | Kurallar, wireflow, içerik/policy, veri sözlüğü | 2–3 gün |
| 1. Tasarım sistemi ve responsive shell | Ana sahne, sheet/dialog, profil sayfası | 4–6 gün |
| 2. D3 küre | Projeksiyon, drag/pinch/wheel, durumlar, label, a11y liste | 6–9 gün |
| 3. Veri/ranking | PostgreSQL şema, quote, tie-break, board projections | 6–8 gün |
| 4. Ödeme | Whop checkout, webhook, idempotency, return status | 4–6 gün |
| 5. Metadata/click/live | Güvenli worker, image cache, activity, SSE/stats | 5–8 gün |
| 6. Profil/SEO/admin | Pin profili, OG, sitemap, moderasyon/ops paneli | 5–8 gün |
| 7. Hardening/QA | A11y, responsive, güvenlik, perf, ödeme regresyonu | 6–9 gün |
| **Toplam** | Üretime yakın v1 | **38–57 kişi-gün** |

Paralelleştirme:

- Geliştirici A: D3/front-end/responsive/a11y.
- Geliştirici B: DB/API/ödeme/metadata.
- Tasarım: özgün marka, component states, mobile.
- QA/ürün: ödeme matrisi, cihazlar, moderation/policy.

Minimum MVP için metadata worker/admin/SSE daraltılırsa 25–35 kişi-güne inilebilir; ancak ödeme doğruluğu, webhook güvenliği ve temel moderasyon ertelenmemelidir.

---

## 28. Test matrisi

### Ranking birim testleri

- İlk listing taban fiyat.
- Alt sıraya isteyerek giriş.
- Eşit toplamda önce gelenin korunması.
- Lideri tam $1 geçme.
- Mevcut listing top-up ve gerekli fark.
- Kampanya başlangıç/bitiş sınırı.
- Hidden-country tabanı.
- İki eşzamanlı webhook.
- Duplicate webhook.
- Refund/chargeback sonrası yeniden sıralama.
- Currency/tutar uyuşmazlığı.

### URL normalizasyon testleri

- Protocol/www/path/query/fragment.
- Uppercase/trailing dot/punycode.
- Apple/Google store özel durumları.
- X/Instagram/GitHub/YouTube geçerli/geçersiz rotalar.
- Invite/chat ve redirector engelleri.
- Credentials, port, localhost/private IP.
- Unicode homograph ve çok uzun URL.

### Ödeme E2E

- Success, cancel, fail.
- Webhook return’den önce/sonra.
- Webhook duplicate/out-of-order.
- Intent expiry.
- Aynı quote ile ikinci checkout.
- İki rakibin eşzamanlı ödemesi.
- Provider timeout.
- Board cache invalidation ve success toast.

### UI/cihaz

- 320×568, 390×844, 430×932.
- 844×390 ve 932×430 landscape.
- 768×1024 ve 1024×768 tablet.
- 1366×768, 1440×900, 1920×1080.
- Safari iOS, Chrome Android, Safari/Chrome/Firefox desktop.
- Touch pinch, mouse wheel, trackpad, keyboard only.
- 200% zoom, reduced motion, high contrast.

### Operasyon

- Zararlı/bozuk OG görseli.
- Slowloris/çok büyük metadata yanıtı.
- DNS redirect/private IP denemeleri.
- Report→hide→appeal akışı.
- Listing kaldırılınca board/profile/cache davranışı.
- Backup restore ve board projection rebuild.

---

## 29. “Aynısı tamamlandı” kabul kriterleri

Fonksiyonel eşdeğer v1 şu koşulları sağlamalı:

- Dünya küresi drag, pinch, wheel ve reduced-motion ile çalışır.
- Boş/sahipli/deal/tartışmalı ülke görsel durumları vardır.
- Ülke paneli ve tam country leaderboard doğru rank/fiyat gösterir.
- Product/social normalizasyonu server tarafında deterministic’tir.
- Aynı listing’in stake’i kümülatif artar; tie-break testlidir.
- Whop imzalı webhook ve idempotency olmadan hiçbir stake aktive olmaz.
- Başarılı ödeme en geç hedef SLO içinde harita, aktivite ve leaderboard’a yansır.
- Live activity, World Order, Crowns/Placements/Spent çalışır.
- `/pin/{listing}` profilleri ve dinamik OG vardır.
- Klikler abuse-aware biçimde sayılır.
- Metadata güvenli worker’dan gelir.
- Moderasyon/hide/report ve audit işlemleri vardır.
- Mobil dikey/yatay/tablet düzenleri erişilebilir ve kırpılmasızdır.
- Klavye ve ekran okuyucu için ülke seçme alternatifi vardır.
- Canonical, robots, sitemap ve temel güvenlik başlıkları tamamdır.
- Initial sahte sıfırlar yerine server-hydrated veri veya loading state vardır.

---

## 30. Lisans, veri ve clean-room notları

- Natural Earth, kendi şartlarında verilerini public domain olarak açıklar; ticari kullanım ve değişiklik için izin verir: [Natural Earth Terms of Use](https://www.naturalearthdata.com/about/terms-of-use/).
- `world-atlas` deposu izin verici bir lisansa sahiptir; dağıtımda copyright/permission notice korunmalıdır: [world-atlas lisansı](https://github.com/topojson/world-atlas/blob/master/LICENSE). Depo arşivlenmiştir; sürümü pinlemek ve veriyi kendi build sürecinde üretmek düşünülebilir: [world-atlas deposu](https://github.com/topojson/world-atlas).
- D3/topojson ve kullanılan fontların lisansları bağımlılık manifestinde ayrıca denetlenmelidir.
- worldmap.lol’un adı, logosu, özgün copy’si, illüstrasyonları, ekran düzeni ve ayırt edici trade dress’i otomatik olarak serbest varlık sayılmaz.
- Güvenli yaklaşım: bu davranış spesifikasyonunu kullanmak, kodu sıfırdan yazmak, özgün marka/görsel sistem oluşturmak ve yalnız lisansı doğrulanmış veri/asset kullanmaktır.
- Ücretli kullanıcı linkleri reklam/UGC niteliğinde açıkça etiketlenmeli; tüketici, reklam, vergi, refund ve gizlilik yükümlülükleri hedef ülkeye göre hukukçu tarafından incelenmelidir.

---

## 31. Kaynaklar

Birincil canlı sayfalar:

- [worldmap.lol ana sayfa](https://worldmap.lol/)
- [About & disclaimer](https://worldmap.lol/about)
- [Rules & payment terms](https://worldmap.lol/rules)

Resmî teknik/hukuki kaynaklar:

- [Whop webhook rehberi](https://docs.whop.com/developer/guides/webhooks)
- [Whop ödeme kabul rehberi](https://docs.whop.com/developer/guides/accept-payments)
- [Natural Earth kullanım şartları](https://www.naturalearthdata.com/about/terms-of-use/)
- [world-atlas kaynak deposu](https://github.com/topojson/world-atlas)
- [world-atlas lisansı](https://github.com/topojson/world-atlas/blob/master/LICENSE)

---

## 32. Son karar

Bu ürünün zor kısmı küreyi çizmek değildir. Gerçek zorluk, **ödeme ile kümülatif sıralamayı aynı doğruluk modelinde birleştirmek**, kullanıcı kontrollü URL/metadata’yı güvenle yayımlamak ve bu yoğun masaüstü kompozisyonu mobil/klavye için erişilebilir kılmaktır.

En doğru yeniden yapım sırası:

1. Fiyat/sıralama/ödeme kurallarını tek sunucu otoritesinde kesinleştirmek.
2. D3 küre ve özgün responsive görsel sistemi kurmak.
3. İmzalı webhook + idempotent stake projection’ı tamamlamak.
4. Güvenli metadata/moderasyon katmanını eklemek.
5. Canlı dağıtım, profil/SEO, erişilebilirlik ve performansı sertleştirmek.

Bu sırayla geliştirildiğinde yalnız yüzeysel bir klon değil, aynı büyüme döngüsünü koruyan ve mevcut üründeki fiyat, responsive, erişilebilirlik ve güven sorunlarını çözmüş daha sağlam bir ürün ortaya çıkar.
