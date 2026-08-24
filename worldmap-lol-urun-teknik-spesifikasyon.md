# worldmap.lol — ürün ve teknik yeniden üretim spesifikasyonu

**İnceleme tarihi:** 24 Ağustos 2026, yaklaşık 16:00 TRT  
**Kapsam:** Canlı masaüstü arayüzü, etkileşimler, herkese açık istemci paketi, HTTP başlıkları, herkese açık API yanıtları, About/Rules/Pin sayfaları. Canlı sayılar değişkendir.  
**Kanıt sınıfları:** “Doğrulandı” canlı arayüzde veya herkese açık ağ/istemci davranışında görüldü. “Çıkarım” sunucu içi uygulama görülmediği için kuvvetli ama doğrulanmamış yorumdur. “Öneri” kurulacak yeni ürün içindir.

## 1. Yönetici özeti

worldmap.lol, ülke başına açık bir ücretli sıralama pazarıdır. Bir ürün sitesi veya desteklenen sosyal profil, bir ülkeye tek seferlik USD ödemeleriyle “stake” ekler. Ülkedeki toplam stake sıralamayı belirler; en yüksek toplam birinci olur. Bu bir bahis veya ödüllü oyun olarak değil, süresizliği garanti edilmeyen bir reklam yerleşimi olarak sunulur.

Ürünü güçlü yapan üç döngü vardır:

1. **Keşif:** Dönen, yakınlaştırılabilen küre; sahipli ülkeler, kampanyalı ülkeler, hover ön izlemeleri.
2. **Rekabet:** Ülke sıralaması, küresel “World Order”, taç/yerleşim/harcama liderlik tabloları ve canlı ödeme akışı.
3. **Dağıtım:** Her liste için paylaşılabilir profil, tıklama sayısı ve dış bağlantıya UTM eklenmesi.

Salt görsel klon kolaydır; güvenli ödeme, doğru sıralama, URL normalizasyonu, webhook idempotency, kötüye kullanım/moderasyon, sponsor bağlantı SEO’su ve politik sınır kararları toplam işin büyük bölümüdür. İşlev aynı kalabilir; marka, logo, metin, özgün görsel ifade ve derlenmiş kod kopyalanmamalıdır.

## 2. Canlı sitede doğrulanan ürün davranışları

### 2.1 Temel ekonomi ve kurallar

- Her ülke bağımsız bir sıralamadır; sıra o ülkedeki **toplam stake** değeridir.
- Ödemeler tam ABD dolarıdır. Her yeni ödeme önceki toplamın üzerine eklenir.
- Eşit toplamda o toplam seviyesine daha önce ulaşan kişi yukarıda kalır.
- İlk yerleşim için standart taban 5 USD’dir.
- Herkese açık istemci yapılandırmasında gizli 1 USD ülkesi **Iceland**’dır.
- 2 USD kampanya kümesi: Indonesia, Lesotho, Italy, Niger, Costa Rica, Tajikistan, New Zealand ve South Korea. Üst sayaç yalnız hâlâ boş olan 2 USD ülkelerini “on sale” olarak sayar.
- Liste süresi için sayaç/sona erme yoktur; daha yüksek toplamlar geldiğinde aşağı düşer ama yerleşim ülke panelinde kalır.
- Hesap yoktur. Liste kimliği, aynı modda gönderilen normalize edilmiş bağlantıdır. Aynı bağlantı yeniden gönderilirse top-up olarak tanınır.
- “Rules” sayfası top-up başına minimumu 5 USD diye yazarken çalışan istemci mevcut bir listing için normal tabanı 2 USD’ye, Iceland için 1 USD’ye indirir. Bu doğrudan bir kural/uygulama tutarsızlığıdır.

Kaynak: [Rules & payment terms](https://worldmap.lol/rules), [About & disclaimer](https://worldmap.lol/about).

### 2.2 Ana küre

- Tam ekran SVG küre; Canvas/WebGL kullanılmıyor.
- D3 ortografik projeksiyon, sphere, graticule ve TopoJSON ülke path’leri var.
- SVG viewBox 1100×760; ilk ölçek 350, ilk dönüş yaklaşık -14/-38; ön yarımküre 90° ile kırpılıyor.
- Pointer sürükleme döndürür; iki parmak pinch ve mouse wheel yakınlaştırır. Ölçek yaklaşık 280–1600 ile sınırlandırılmıştır.
- Yaklaşık üç saniye hareketsizlikten sonra otomatik dönüş başlar; panel/modal/hover seçimi dönüşü durdurur.
- prefers-reduced-motion durumunda otomatik dönüş ve hareketli geçişler kapatılır.
- Boş, yeterince büyük ülkelerde ad etiketi; sahipli ülkelerde lider favicon’u, owner adı ve teklifçi sayısı; kampanyalı boş ülkelerde turuncu “🔥 $2” hapı görünür.
- MultiPolygon etiket merkezi için en büyük ana parça kullanılıyor.
- Ülke alanı küçükse metin etiketi saklanıyor ama geometri tıklanabilir kalıyor.
- Ana CTA bir ülke seçici açmıyor; o anda boş ülkeler arasından rastgele bir ülkeyi sağ panelde seçiyor.
- Antarctica filtrelenmiş. Taiwan ve Palestine seçimi istemcide devre dışı; ayrıca Crimea için özel “disputed” poligonu eklenmiş. Bu kararları aynen kopyalamak politik/hukuki risk taşır.
- World Atlas dosyası çalışma anında önce jsDelivr’dan, başarısızsa unpkg’den çekiliyor.

### 2.3 Masaüstü katmanları

- Sol üst: logo; “Put your startup on the map. Literally.”; ülke talep CTA’sı; kupa ve bilgi düğmeleri.
- Sağ üst: aktif ülke, toplam stake ve boş 2 USD kampanya ülkesi sayaçları.
- Sol alt: son beş ödeme etkinliği; listing, ülkedeki güncel sıra, ülke, tutar ve göreli zaman. Altında 48 saat ziyaretçi ve “watching” sayısı.
- Sağ alt: 385 px genişliğinde World Order paneli; dünya çapındaki ilk 10 tekil yerleşimi gösterir.
- Ülke tıklanınca aynı panel yaklaşık 240 ms geçişle ülke detayına dönüşür.
- Sahipli ülke paneli: ülke adı, teklifçi sayısı, lider tutarı, bütün placement satırları ve “Claim a spot” CTA’sı.
- Boş ülke paneli: “No bids yet”, taban fiyat ve “Be the first” CTA’sı.
- Panel “Expand” ile büyük World Order modalına dönüşür. Her satırın hover CTA’sı o satırın ülkesine bir üst USD ile stake modalını açar.
- Masaüstünde sahipli ülke hover’ı gecikmeli kompakt ön izleme; list satırı hover’ı OG görsel/açıklama/tıklama/profile ön izlemesi üretir.

### 2.4 Mobil kırılımlar

Canlı CSS’de doğrulanan davranışlar:

- 820 px altında hover/OG ön izleme gizlenir.
- 720 px altında üst canlı sayaç ve sol-alt aktivite paneli gizlenir; alt sabit aksiyon düğmeleri ve geniş mobil panel davranışı devreye girer.
- 600 px altında pazarlama/CTA kartı gizlenir; kompakt logo + kupa/bilgi düğmeleri kalır.
- Sağ panel 720 px altında sağ/sol 12 px’e yayılan alt kart olur; kapatıldığında “Live activity” ve “World Order” FAB’larıyla geri açılır.
- 520 px ve altı expanded/modal/profile ızgaralarında ek sıkıştırmalar vardır.

### 2.5 Stake formu ve tahmini sıra

- Modal başlığı “Stake on {country}”.
- İki mod: “Product URL” ve “Social profile”.
- Tutar input’u tam sayı, ülke/listing durumuna bağlı minimumla çalışır.
- Tutar her değiştiğinde öngörülen sıra ve birinciliği almak için gereken tutar hesaplanır.
- Yeni bir listing için öngörülen sıra, önerilen toplamdan büyük veya eşit rakip sayısı + 1’dir; böylece eşitlikte yeni gelen aşağıda kalır.
- Product URL yalnız alan adına indirgenir; scheme, fragment, query, www/m/mobile alt alan önekleri ve path atılır.
- Apple App Store’da uygulama id’si, Google Play’de package id korunur.
- Social modunda X/Twitter profil, Instagram profil, GitHub kullanıcı veya repo ve YouTube kanal türleri desteklenir; post/video kabul edilmez.
- Telegram, WhatsApp, Discord, Signal ve Messenger chat/invite bağlantıları engellenir.
- Liste açıklaması, görseli ve favicon’u URL metadata’sından otomatik türetilir; kullanıcıya ayrı pitch düzenleme alanı yoktur.
- Checkout isteği: POST /api/checkout, gövde country, owner, amount ve social alanlarıdır. Başarılı yanıtın URL’sine gidilir; arayüz “Secure payment via Whop” der.
- Payment dönüşü paid=1, country ve amount query’lerinden toast üretir; board hemen, 2.5 sn ve 5 sn sonra yenilenir; query history’den temizlenir.

### 2.6 Doğrulanmış kritik top-up UX hatası

Belçika örneğinde mevcut bir placement toplamı 5 USD, lider 10 USD idi. Birincilik için gereken ek tutar 6 USD’dir. Modal yeni açıldığında varsayılan tutar 11 USD’dir. Ardından mevcut bağlantı yazıldığında sistem bunu top-up olarak tanır, minimumu 2 USD yapar; fakat varsayılan 11 USD’yi 6 USD’ye yeniden hesaplamaz ve “New total $16” gösterir. Kullanıcı düzenlemeden checkout’a giderse fark yerine 11 USD öder.

Bu, “reclaiming #1 only costs the difference” metni ve ödeme sonrası iade yok kuralı nedeniyle yüksek öncelikli bir güven/consumer-protection problemidir. Yeni üründe server-authoritative quote, açık “mevcut toplam + bu ödeme = yeni toplam” özeti ve ikinci onay zorunlu olmalıdır.

### 2.7 Liderlik tabloları

- **World Order panel/modal:** Tekil placement’ları toplam stake’e göre ilk 10 olarak gösterir.
- **The board / #1 Crowns:** Owner’ın kaç ülkede birinci olduğu.
- **Placements:** Owner’ın toplam placement sayısı.
- **Spent:** Owner’ın bütün ülkelerdeki mevcut toplam stake’lerinin toplamı.
- Her global leaderboard satırı dahili /pin/{site} profil sayfasına gider.
- Dünya modalındaki listing satırları dış siteye gider; tıklamalar sayılır.

### 2.8 Aktivite, sayaç ve tıklama

- /api/activity 12 saniyede bir istenir; arayüz ilk beşi gösterir.
- /api/stats 30 saniyede bir istenir.
- /api/board sadece ilk yükte ve ödeme dönüşünde yenilenir; normal ziyaret sırasında düzenli yenilenmez. “Live” etiketi tam gerçek zamanlı leaderboard anlamına gelmez.
- İstemci, API’den gelen watching değerine **sabit +3 ekleyerek** gösterir. Bu güven problemi olarak değerlendirilmelidir ve yeniden üretilmemelidir.
- Dış listing tıklaması navigator.sendBeacon ile /api/click’e owner gönderir.
- Dış URL’ye utm_source=worldmap.lol eklenir.
- Click metriği owner düzeyindedir; aynı owner’ın farklı ülkelerinde aynı toplam görünür, placement/country attribution yoktur.
- Dış bağlantılar target=_blank, rel=noopener noreferrer kullanıyor; ancak ücretli ve kullanıcı üretimi olmasına rağmen sponsored/ugc yoktur.

### 2.9 Paylaşılabilir profil

- Dinamik rota: /pin/{canonical-owner}.
- Başlık, otomatik açıklama, “Visit site”, ülke sayısı, #1 sayısı, placement sayısı, toplam click ve “Territories held” listesi.
- Her ülke altında o ülkedeki bütün yarışmacılar ve owner’ın sırası görünür.
- Dinamik OG görseli /api/pin-og?site=... ile üretilir.
- Aktif olmayan rastgele owner yolu da 200 döner ve “No flags” boş sayfası üretir; noindex yoktur. Bu soft-404 ve sonsuz URL crawl riskidir.
- pin-og yanıtı sabit URL üzerinde bir yıl immutable cache taşır; ranking değişince sosyal kartın bir yıl eski kalma riski vardır.

### 2.10 Statik sayfalar ve moderasyon

- About sayfası listelerin kamu tarafından gönderildiğini, doğrulanmadığını, endorsement/affiliation olmadığını ve üçüncü taraf link sorumluluğu taşımadığını söyler.
- Rules: tam USD, toplam stake, eşitlik, link canonicalization, yasak içerik, moderasyon, ödeme, iade/chargeback ve sorumluluk sınırlarını anlatır.
- Moderasyon UI’sı veya self-service report formu yok; tek kanal e-posta.
- Hesap, ownership verification, edit/delete, outbid bildirimi, ödeme geçmişi, listing analitik paneli yoktur.
- Görünen bir Privacy Policy, cookie/analytics açıklaması, şirket tüzel unvan/adres, yürürlük tarihi, yaş sınırı veya governing-law bölümü yoktur.

## 3. Özellik matrisi

| Özellik | Canlı durum | Yeniden üretimde karar |
|---|---|---|
| SVG dönen küre | Var; D3/TopoJSON | Korunmalı, klavye alternatifi eklenmeli |
| Drag/pinch/wheel/auto-spin | Var | Korunmalı; visibility pause ve reduced motion |
| Ülke bazlı stake sırası | Var | Server-authoritative transaction |
| Rastgele “Claim” CTA | Var | Korunabilir; ayrıca arama/liste eklenmeli |
| Kampanya/easter egg | 2 USD seti + Iceland 1 USD | Admin’den yönetilebilir fiyat politikası |
| Country detail panel | Var | Derin bağlantı ve paylaşılabilir ülke URL’si eklenmeli |
| Global top placements | Var | Tanımı açıklaştırılmalı |
| Crowns/placements/spent board | Var | Deterministik tie-break ve sayfalama |
| Live payment activity | 12 sn polling | SSE/realtime veya revision polling |
| Visitor/presence | Var; UI +3 | Gerçek, tanımlı ve denetlenebilir metrik |
| URL/social canonicalization | Var | Tek server kütüphanesi, sürümlü canonicalization |
| Whop hosted checkout | Var | İmzalı quote + idempotent webhook |
| Top-up | Var; tutarsız/overpay riski | Mevcut toplamı tanıyınca tutarı zorunlu yeniden hesapla |
| Share profile | Var | Gerçek 404/noindex, canonical ve sitemap |
| Click counter | Var; owner geneli | Placement attribution, bot/dedupe |
| Metadata/favicon/OG | Var | Güvenli proxy + async worker |
| Moderasyon | E-posta | Report UI, admin queue, audit |
| Account/owner verification | Yok | Magic-link veya domain verification |
| SEO | Kısmi | SSR data, h1, canonical, sitemap, sponsored/ugc |
| Accessibility | Kısmi | WCAG 2.2 AA kabul kriteri |
| Localization | Yok, en | İhtiyaca göre i18n |

## 4. Doğrulanmış mevcut teknik yapı

### 4.1 İstemci ve hosting

- Next.js App Router/React sinyalleri; dinamik yanıtta x-powered-by: Next.js.
- Vercel hosting/cache başlıkları.
- Ana rota prerender edilmiş; HTML ilk aşamada 0 country, 0 USD ve boş board gönderiyor, hydration sonrası /api/board ile doluyor.
- Harita bileşeni istemcide D3 geo/selection/color/timer fonksiyonları ve topojson-client ile kuruluyor.
- Natural Earth 110m TopoJSON, world-atlas@2 CDN’den çalışma anında geliyor.
- Global CSS yaklaşık 69.5 KB uncompressed; geçerli sayfada kullanılmayan “v2/game/race” stilleri ve Press Start 2P fontu da aynı dosyada bulunuyor.
- Ana page chunk yaklaşık 40.6 KB, D3/topology chunk yaklaşık 62.4 KB uncompressed; world-atlas dosyası ayrıca yaklaşık 108 KB.
- Fontlar: Fredoka (display), Nunito (body), ayrıca yüklenen Press Start 2P.
- Analitik: datafa.st script’i, açık website id/domain attribute’larıyla afterInteractive yükleniyor.

### 4.2 Herkese açık API yüzeyi

- GET /api/board: countries → placement dizileri; winning; raised; activeCountries.
- GET /api/activity: payment event’leri.
- GET /api/stats: watching ve visitors48h.
- POST /api/checkout: Whop checkout URL’si.
- POST /api/click: owner click sayımı.
- GET /api/og?site=...
- GET /api/icon?domain=...
- GET /api/pin-og?site=...

Kritik: /api/activity herkese açık yanıtta gerçek Whop provider payment id’lerini yayınlıyor. Public event için bağımsız rastgele public_event_id kullanılmalı; provider id ve ödeme nesnesi özel kalmalıdır.

### 4.3 Görsel/metadata zinciri

- Map favicon: DuckDuckGo icon servisi; hata halinde Google favicon endpoint’i.
- Listing avatarı: unavatar.io; hata halinde ilk harf placeholder.
- Listing OG görseli/açıklaması: board payload’ı veya /api/og.
- Dominant renk: /api/icon görseli 16×16 canvas’a çizilip doygun piksellerden ortalama; owner rengi ülkeleri boyar.
- Hotlink edilen üçüncü taraf OG/favicons kullanıcı IP/referrer sızıntısı, performans ve içerik güvenliği riski yaratır.

### 4.4 Sunucu içi bilinmeyenler

Canlı dış inceleme DB ürünü, ORM, kuyruk, metadata scraper implementation’ı ve Whop webhook route’unu doğrulamaz. ISO Postgres-benzeri timestamp’ler tek başına Supabase/Postgres kanıtı değildir. Bu alanlarda aşağıdaki mimari öneridir.

## 5. Önerilen hedef mimari

### 5.1 Bileşen akışı

**Browser**
→ Next.js server-rendered shell + güncel board snapshot  
→ client Globe SVG ve erişilebilir ülke liste alternatifi  
→ quote/session API  

**Vercel/Edge CDN**
→ Next.js Route Handlers / Server Actions  
→ PostgreSQL (placement, payment, ranking, moderation)  
→ Redis (presence, rate limit, board revision/cache)  
→ Queue/worker (OG/favicon fetch, malware/moderation, image rasterization)  
→ Object storage/CDN (proxy görseller, dinamik OG)  

**Whop hosted checkout**
→ imzalı payment.succeeded webhook  
→ idempotent DB transaction + outbox  
→ realtime event/SSE veya managed pub/sub  
→ istemci board revision update

Küçük başlangıç için ayrı mikroservis gerekmez: TypeScript Next.js monoliti, PostgreSQL, Redis ve worker yeterlidir. Realtime için managed Ably/Pusher/Supabase Realtime veya 5–10 saniyelik ETag/revision polling kullanılabilir.

### 5.2 Önerilen veri modeli

**countries**
- id/iso_numeric/iso2, slug, canonical_name, localized_names, flag
- topology_id, centroid_lon/lat, label_lon/lat, selectable
- initial_floor_cents, topup_floor_cents
- promo_type, promo_starts_at, promo_ends_at
- dispute_policy/status, display_order

**advertisers**
- id, owner_key unique, mode enum
- canonical_owner, host, canonical_path
- destination_url, submitted_url
- display_name, verification_status, moderation_status
- created_at, updated_at, removed_at
- canonicalization_version

**advertiser_metadata**
- advertiser_id, title, description
- og_image_object_key, favicon_object_key, dominant_color
- fetch_status, final_url, fetched_at, content_hash

**placements**
- id, country_id, advertiser_id; unique(country_id, advertiser_id)
- total_stake_cents
- first_staked_at, last_staked_at
- reached_current_total_at
- status
- Rank mümkünse saklanmaz; window query/materialized view ile hesaplanır.

**checkout_intents**
- id, public_token, country_id, advertiser candidate
- amount_cents, currency, existing_total_snapshot, projected_rank
- provider, provider_checkout_id, idempotency_key
- status, quote_expires_at, created_at

**payments / stake_events**
- payment id, intent id, provider payment id unique, provider event id unique
- amount/currency/status/paid_at
- stake event: placement_id, delta_cents, total_after_cents, event_at
- Event sourcing ödeme mutabakatı ve tie-break audit’i sağlar.

**click_events / click_hourly**
- public placement id, country, advertiser, anon session hash, event_at
- bot_class, campaign, referrer class
- Ham olay için kısa retention; UI için saatlik aggregate.

**activity_events**
- public_event_id; ödeme provider kimliği içermez.

**reports / moderation_actions**
- target placement/advertiser, reason, evidence, reporter contact
- state, reviewer, decision, legal basis, timestamps.

**webhook_events / outbox**
- webhook_id unique, payload hash, received/processed state
- outbox event board_revision_changed.

### 5.3 Ranking algoritması

1. Ödeme yalnız payment.succeeded imzalı webhook’tan sonra stake olur.
2. Aynı country + advertiser için placement satırı transaction içinde kilitlenir.
3. total_stake += delta; reached_current_total_at = ödeme başarı zamanı.
4. Sıra: total_stake DESC, reached_current_total_at ASC, id ASC.
5. Birincilik farkı: max(topup floor, max_other_total + 1 USD - own_total).
6. İstemci yalnız tahmin gösterir; checkout öncesi server quote sonucu otoritedir.
7. Quote ekranı: önceki toplam, bu ödeme, yeni toplam, tahmini sıra, quote expiry ve “checkout sırasında sıra değişebilir” açıklaması.
8. Tüm para integer minor unit olarak tutulur; float kullanılmaz.

### 5.4 Önerilen API

- GET /api/v1/map?revision=... → country ISO, placements, counters, ETag/revision.
- GET /api/v1/countries/{iso}/leaderboard.
- GET /api/v1/advertisers/{slug}.
- GET /api/v1/leaderboards?metric=crowns|placements|spent.
- GET /api/v1/activity?limit=5 → yalnız public id.
- POST /api/v1/checkout/quote → canonical owner, existing total, minimum, projected rank, expires_at.
- POST /api/v1/checkout/session → quote_id + idempotency key.
- GET /api/v1/checkout/intents/{opaque-token} → payment status.
- POST /api/webhooks/whop → raw body signature verify, dedupe, queue.
- GET /go/{placementPublicId} → click enqueue + güvenli 302; JS beacon’a bağımlılığı azaltır.
- POST /api/v1/presence/heartbeat.
- POST /api/v1/reports.
- Admin: moderation, promo price, country selectability, refunds/disputes, audit.

## 6. Güvenlik ve ödeme kontrolleri

### P0 — para ve fulfillment

- Client country/amount/owner değerlerine güvenme; sunucuda yeniden canonicalize ve minimumu yeniden hesapla.
- Whop webhook raw body üzerinde imza doğrulaması; timestamp/replay kontrolü.
- Whop delivery at-least-once ve sırasızdır: webhook-id/provider event id unique, handler idempotent, out-of-order güvenli.
- Provider payment id, payer bilgisi ve ham payment object hiçbir public API’ye çıkmamalı.
- Return query’sini başarı kanıtı kabul etme. Opaque intent token ile sunucudan gerçek durum oku.
- Checkout intent ile webhook currency, amount ve metadata’yı karşılaştır.
- Refund/dispute/chargeback event’lerini ayrı state machine ile işle.
- Her ödeme ve ranking değişimi immutable audit trail’e yazılmalı.

Whop’un güncel resmi dökümanı imza doğrulaması, hızlı 2xx, duplicate/idempotency ve sırasız teslimatı açıkça şart koşar: [Whop Webhooks](https://docs.whop.com/developer/guides/webhooks).

### P0/P1 — URL, SSRF ve içerik

- WHATWG URL parser; yalnız https, credentials/port/localhost/private-reserved IP reddi.
- DNS resolve sonrası ve her redirect adımında private IP kontrolü; DNS rebinding önlemi.
- Redirect limiti, response boyutu, timeout, content-type allowlist.
- SVG’yi doğrudan sunma; rasterize et. Görselleri indir, malware tara, object storage’dan servis et.
- OG HTML parse işlemini queue worker’da yap; egress allow policy kullan.
- Social provider doğrulamasını server-side tut.
- React escaping korunmalı; HTML description render edilmemeli.
- Domain/marka verification badge’i; sahte affiliation engeli.

### P1 — abuse ve platform

- Checkout/click/OG/icon/report endpoint’lerinde IP + session + owner rate limit.
- Click fraud dedupe, bot sınıflama ve anomaliler.
- Safe Browsing/phishing/malware denetimi; denylist ve hızlı takedown.
- Admin 2FA, RBAC ve audit log.
- CSP; frame-ancestors, nosniff, Referrer-Policy, Permissions-Policy. Canlı sitede HSTS dışında bu başlıkların çoğu görünmedi.
- Secret’lar server env/KMS; rotasyon ve erişim kaydı.
- PostgreSQL PITR, günlük backup restore testi.

## 7. Performans ve güvenilirlik

Hedefler: p75 LCP <2.5 s, INP <200 ms, CLS <0.1; orta seviye mobilde 50–60 fps küre etkileşimi.

- World Atlas exact version’ı projede self-host et; immutable CDN + Brotli; runtime iki üçüncü taraf CDN bağımlılığını kaldır.
- Root HTML’e güncel board snapshot koy; “0 → gerçek değer” flash’ını kaldır.
- Board için revision/ETag ve stale-while-revalidate; stats/activity no-store spam’ini azalt.
- Board güncellemesini webhook outbox’ından push et; activity ile map’in farklı görünmesini engelle.
- Tab hidden olduğunda auto-spin/polling durmalı.
- Hover görselleri lazy; width/height; proxy CDN; decode async.
- Kullanılmayan v2/game CSS/fontları route split veya purge et.
- Ranking modalları ve admin bundle’ı lazy import.
- Map topology parse gerekirse Web Worker; 176 path düzeyinde önce ölç.
- API/DB için synthetic monitoring; webhook lag, failed checkout, ranking mismatch, scraper failure alarmı.
- Whop webhook gecikirse mevcut 0/2.5/5 saniyelik üç deneme yetmez; intent status exponential polling veya push kullanılmalı.

## 8. SEO

Canlı bulgular:

- Root title/description, OG ve Twitter kartları var.
- Root’ta main, nav, h1 veya h2 yok; yalnız modal h3’leri DOM’da.
- Server HTML board’u boş ve sayaçları sıfır basıyor.
- canonical görünmedi.
- robots.txt ve sitemap.xml 404.
- Geçersiz /pin/... 200 ve indexlenebilir soft-404.
- Aktif Pin metadata’sı dinamik; canonical/og:url eksik.
- Ücretli UGC dış bağlantıları rel=noopener noreferrer; sponsored/ugc yok.

Öneriler:

- Root server render: tek h1, açıklayıcı metin, güncel ilk 10 ve crawlable country list.
- robots.txt, yalnız aktif profile/country URL’lerini içeren sitemap.
- Her route canonical; geçersiz profile gerçek 404 veya noindex.
- Pin için complete OG/Twitter: title, description, url, type, image; OG cache revision query veya tag purge.
- WebSite, Organization, ItemList/ProfilePage ve Breadcrumb JSON-LD; listing’in marka sahibi olduğu izlenimi yaratma.
- Ödemeli ve public listing linklerinde rel="sponsored ugc nofollow noopener noreferrer".
- Ücretli linklerin “sponsored”, kullanıcı üretiminin “ugc” ile işaretlenmesini Google açıkça önerir: [Google Search Central](https://developers.google.com/search/docs/crawling-indexing/qualify-outbound-links).
- Spam/scam moderation SEO için de lansman kapısı olmalı.

## 9. Accessibility

Canlı güçlü yönler:

- SVG’ye role=img ve aria-label verilmiş.
- Panel aria-live=polite.
- Reduced-motion destekleniyor.
- External linklerde noopener/noreferrer.

Canlı eksikler:

- Country path’leri focusable/button değil; klavye ile ülke seçilemiyor.
- Root main/h1/nav yok.
- Dialog’ların accessible name/aria-labelledby’si yok.
- Modal açılınca odak içeride başlamıyor; arka plan inert değil; focus trap ve odak geri dönüşü yok.
- “Tablist” çocukları role=tab/aria-selected taşımıyor.
- URL input’u placeholder’a bağımlı; number input’un accessible label ilişkisi yok.
- Hata/price mesajlarının aria-describedby/live ilişkisi yok.
- Bazı icon butonlar 28–36 px; 44 px hedef önerilir.
- Gri küçük metin/map label kontrastı ve zoom trap ayrıca test edilmeli.

WCAG 2.2 AA hedefi:

- main/h1/landmark/skip link.
- Her ülke için klavye ile erişilebilir arama/liste alternatifi; path aria-label “Turkey, unclaimed, minimum $5”.
- Dialog focus trap, Escape, backdrop, focus restore, aria-labelledby/description.
- Gerçek tabs semantiği.
- label/for, inputmode, error id/aria-invalid; price değişimi polite live region.
- Emoji decorative ise aria-hidden; anlam taşıyorsa metin label.
- 200% zoom, keyboard-only, VoiceOver/NVDA ve reduced-motion E2E kabul testi.

## 10. Test stratejisi

### Unit/property

- URL canonicalization için scheme, IDN/punycode, unicode, path/query/fragment, social provider, app-store id, redirect ve kötü girdiler.
- Fiyat floor/top-up, exact tie, current owner exclusion, global aggregate.
- Para integer ve overflow.
- Rank invariants: toplam arttığında aynı placement geriye düşmez; tie deterministik.

### Integration

- PostgreSQL concurrent payment transaction ve unique constraints.
- Duplicate/out-of-order webhook, failed/pending/succeeded/refund/dispute.
- Quote expiry ve checkout sırasında rakip ödeme yarışı.
- Metadata worker SSRF, redirect, timeout, oversized HTML/image.
- Outbox publish/consumer retry.

### E2E

- Boş, claimed, promo ve hidden-floor ülkeleri.
- Product/social validation ve canonical identity top-up.
- Whop sandbox checkout; return intent ve delayed webhook.
- Desktop/mobile/coarse pointer, drag/pinch/wheel.
- Expanded World Order, 3 leaderboard tabı, Pin, empty/404.
- Outbound click, UTM, sponsored/ugc.

### Kalite kapıları

- Playwright visual regression: 390, 768, 1440, 1920; Chrome, Safari/WebKit, Firefox.
- axe + manuel keyboard + VoiceOver/NVDA.
- Lighthouse/WebPageTest 4G/3G; uzun task ve SVG frame profiling.
- k6/Artillery: board, click ingestion, checkout spike, SSE.
- SAST, dependency/SBOM, OWASP ZAP, URL fuzz/SSRF testleri.
- Payment/DB günlük mutabakat raporu.
- SEO rendered HTML, meta, sitemap, gerçek 404 testleri.

## 11. Aşamalı geliştirme planı

### Faz 0 — 1–2 hafta

- Özgün marka/tasarım yönü; ülke/dispute politikası.
- Reklam/auction hukuki inceleme; fiyat, iade, vergi, gizlilik.
- Canonicalization ve ranking ADR; ödeme tehdit modeli.

### Faz 1 — 2 hafta

- Tasarım sistemi; full-screen SVG küre; mock board.
- Desktop/mobile panel, modallar, reduced motion.
- Klavye ülke listesi ve temel a11y.

### Faz 2 — 2–3 hafta

- PostgreSQL schema, read APIs, rankings, profiles.
- Metadata worker/proxy, click redirect/analytics.
- SSR root, SEO, Pin OG.

### Faz 3 — 2–3 hafta

- Quote/session, Whop checkout, imzalı webhook, idempotent stake transaction.
- Payment return status, reconciliation ve failure states.

### Faz 4 — 2 hafta

- Realtime/revision, activity/presence, global boards.
- Report/admin moderation, verification, abuse limits.

### Faz 5 — 2 hafta

- Security hardening, performance, cross-browser, a11y ve legal QA.
- Soft launch, observability, backup/restore ve incident runbook.

Lansman kapıları:

1. Webhook replay/concurrency testleri geçmeden gerçek ödeme yok.
2. SSRF ve moderation/reporting olmadan public URL kabulü yok.
3. sponsored/ugc ve spam koruması olmadan indexleme yok.
4. Payment–stake günlük mutabakatı sıfır fark göstermeli.

## 12. Efor ve ekip tahmini

Varsayım: tek dil/tek para, yaklaşık 200 ülke, Whop hosted checkout, özgün ama aynı işlevsel seviyede arayüz.

- Salt read-only görsel prototip: 5–10 geliştirici günü.
- Ödeme çalışan lean MVP: 16–24 kişi-hafta, 8–12 takvim haftası.
- Moderasyon, güvenlik, SEO/a11y ve operasyonu güçlü v1: 24–36 kişi-hafta, 12–16 takvim haftası.
- Tek güçlü full-stack geliştirici: yaklaşık 14–20 hafta; hukuk/moderasyon hariç.

Önerilen ekip:

- 1 creative frontend/visualization engineer.
- 1 backend/full-stack/payment engineer.
- 0.5 product designer/PM.
- 0.5 QA automation/a11y.
- Fractional security/DevOps ve hukuk/vergi danışmanı.
- Lansman sonrası fractional trust & safety/support.

Kabaca kişi-hafta:

- Ürün/politika/tasarım: 3–5.
- Globe ve responsive frontend: 4–6.
- Data/ranking/API: 4–6.
- Checkout/webhook/reconciliation: 3–5.
- Metadata/profile/SEO/realtime: 3–5.
- Moderation/admin/security: 4–6.
- QA/a11y/performance/release: 3–5.

## 13. Üçüncü taraf, lisans ve hukuki risk

### Harita ve açık kaynak

- Site kendi modalında Natural Earth via world-atlas kullandığını bildiriyor.
- Natural Earth raster/vector data public domain; ticari kullanım ve değişiklik serbesttir: [Natural Earth Terms of Use](https://www.naturalearthdata.com/about/terms-of-use/).
- world-atlas ISC-benzeri lisansla dağıtılıyor; copyright/izin bildirimi kopyalarda tutulmalıdır. Repo 2023’te arşivlenmiş: [world-atlas LICENSE](https://github.com/topojson/world-atlas/blob/master/LICENSE).
- D3, topojson-client ve fontların exact versiyon/lisansları SBOM’da tutulmalı; NOTICE üretimi CI kapısı olmalı.
- Veri lisansı, sınır sunumunun politik doğruluğu/yerel mevzuat riskini çözmez.

### Marka, telif ve paid-link

- worldmap.lol adı, logo, slogan/copy, özgün kart/ikon/renk kompozisyonu, OG görselleri ve derlenmiş kod doğrudan kopyalanmamalı.
- İşlev ve genel fikir yeniden uygulanabilir; özgün ad, metin, illüstrasyon ve tasarım dili üret.
- Üçüncü taraf marka/favicons yalnız tanımlama amacıyla, takedown ve verification süreciyle gösterilmeli.
- OG görsel/açıklama hotlink/scrape; telif, site şartları ve privacy riski taşır. Cache/proxy ve şikâyet süreci gerekir.
- Paid user-submitted linkler sponsored + ugc işaretlenmezse link-spam/manual-action riski vardır.

### Reklam, tüketici ve ödeme

- “Stake/bid/conquer/own” dili ödeme ve ülke sahipliği izlenimini güçlendirir. Ödül/şans olmasa da hedef ülkelerde reklam, auction, gambling ve consumer-protection incelemesi gerekir.
- “Tüm satışlar final” zorunlu tüketici haklarını bertaraf etmez.
- Vergi/VAT, fatura, merchant-of-record rolü, yaş/ülke uygunluğu, chargeback ve yaptırım listeleri netleştirilmeli.
- Whop hosted checkout PCI kapsamını azaltır ama API anahtarı, webhook secret, payer data ve provider id’leri korunmalıdır.

### UGC, moderasyon ve gizlilik

- Herkesin başkasının markasını listeleyebilmesi impersonation, phishing, defamation ve trademark sorununa açıktır.
- E-posta-only moderation yetersiz; notice-and-action, appeal, takedown SLA ve audit gerekir.
- DataFast analitiği, click/presence, UTM ve üçüncü taraf görsel çağrıları privacy notice, retention, DPA ve gerektiğinde consent gerektirir.
- Dış görselleri doğrudan yüklemek ziyaretçinin IP’sini üçüncü tarafa açıklar; first-party proxy tercih edilmeli.

## 14. En önemli kabul kriterleri

1. Kullanıcı checkout öncesi eski toplam, ödeme, yeni toplam ve olası sırayı açıkça görür; mevcut listing tanınınca varsayılan tutar farka yeniden hesaplanır.
2. Aynı payment/webhook kaç kez veya hangi sırayla gelirse gelsin stake bir kez uygulanır.
3. Public JSON’da provider/payment/payer kimliği yoktur.
4. Country ranking ve global aggregate aynı event kaynağından deterministik üretilir.
5. Map, country listesi ve bütün checkout akışı yalnız klavyeyle tamamlanabilir.
6. Root ve aktif profiller SSR crawlable; geçersiz profil 404/noindex; paid links sponsored/ugc.
7. URL scraper private IP/redirect/oversize fuzz testlerini geçer.
8. Board update ödeme sonrası 2 saniye p95 içinde veya “processing” durumuyla doğru temsil edilir.
9. İzlenme ve click sayıları yapay artırılmaz; metrik tanımı ve fraud filtresi vardır.
10. Ülke/sınır politikası, marka/telif ve reklam/ödeme şartları hukuk incelemesinden geçer.

