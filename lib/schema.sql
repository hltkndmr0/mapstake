-- PostgreSQL şeması. Tek kaynak: scripts/migrate.mjs bunu uygular.
--
-- SQLite'tan taşınırken değişenler:
--   INTEGER PRIMARY KEY  -> BIGINT GENERATED ALWAYS AS IDENTITY
--   TEXT zaman damgaları -> timestamptz (tie-break karşılaştırması için doğru tip)
--   datetime('now')      -> now()
--   0/1 bayrakları       -> BOOLEAN

-- Ülke ve alt birim (il/eyalet) TEK tabloda. Sıralama motoru bu sayede
-- iki seviye için de aynı kodu kullanır: WHERE territory_id = $1
CREATE TABLE IF NOT EXISTS territories (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind              TEXT    NOT NULL CHECK (kind IN ('country','admin1')),
  parent_id         BIGINT  REFERENCES territories(id),
  code              TEXT    NOT NULL UNIQUE,   -- 'TUR' | 'TR-34'
  slug              TEXT    NOT NULL UNIQUE,   -- 'turkey' | 'turkey/istanbul'
  name              TEXT    NOT NULL,
  iso2              TEXT,
  subtype           TEXT,                      -- 'Province' | 'State' | ...
  lon               DOUBLE PRECISION NOT NULL,
  lat               DOUBLE PRECISION NOT NULL,
  area              DOUBLE PRECISION NOT NULL DEFAULT 0,
  base_price_cents  INTEGER NOT NULL,
  selectable        BOOLEAN NOT NULL DEFAULT TRUE,
  child_count       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_terr_parent ON territories(parent_id);
CREATE INDEX IF NOT EXISTS idx_terr_kind   ON territories(kind);
-- Arama: ad üzerinde büyük/küçük harf duyarsız ön ek eşleşmesi.
CREATE INDEX IF NOT EXISTS idx_terr_name_lower ON territories(lower(name) text_pattern_ops);

-- Reklamveren = normalize edilmiş link. Hesap sistemi yok.
CREATE TABLE IF NOT EXISTS advertisers (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mode              TEXT    NOT NULL CHECK (mode IN ('product','social')),
  canonical_key     TEXT    NOT NULL,          -- 'ornek.com' | 'x.com/kullanici'
  display_url       TEXT    NOT NULL,
  outbound_url      TEXT    NOT NULL,
  title             TEXT,
  description       TEXT,
  icon_url          TEXT,
  brand_color       TEXT,
  moderation_status TEXT    NOT NULL DEFAULT 'approved'
                    CHECK (moderation_status IN ('pending','approved','hidden','blocked')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mode, canonical_key)
);

-- Bir bölgedeki bir reklamverenin kümülatif toplamı.
CREATE TABLE IF NOT EXISTS placements (
  id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  territory_id             BIGINT NOT NULL REFERENCES territories(id),
  advertiser_id            BIGINT NOT NULL REFERENCES advertisers(id),
  total_cents              INTEGER NOT NULL DEFAULT 0,
  first_staked_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Beraberlik çözümü: bu toplama ULAŞMA anı. Denetlenebilir tie-break.
  reached_current_total_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  click_count              INTEGER NOT NULL DEFAULT 0,
  UNIQUE (territory_id, advertiser_id)
);
CREATE INDEX IF NOT EXISTS idx_pl_terr ON placements(territory_id, total_cents DESC);
CREATE INDEX IF NOT EXISTS idx_pl_adv  ON placements(advertiser_id);

-- Sunucu otoritesindeki teklif. İstemcinin gönderdiği tutar asla yetkili değil.
CREATE TABLE IF NOT EXISTS intents (
  id                   TEXT    PRIMARY KEY,     -- tahmin edilemez opak token
  territory_id         BIGINT  NOT NULL REFERENCES territories(id),
  mode                 TEXT    NOT NULL,
  canonical_key        TEXT    NOT NULL,
  display_url          TEXT    NOT NULL,
  outbound_url         TEXT    NOT NULL,
  amount_cents         INTEGER NOT NULL,
  existing_total_cents INTEGER NOT NULL,
  projected_rank       INTEGER,
  status               TEXT    NOT NULL DEFAULT 'created'
                       CHECK (status IN ('created','paid','expired','cancelled')),
  provider             TEXT    NOT NULL DEFAULT 'mock',
  -- Paket alım: ülke ödemesiyle birlikte bedelsiz verilen alt birim.
  bundle_territory_id  BIGINT  REFERENCES territories(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at           TIMESTAMPTZ NOT NULL
);

-- provider_event_id UNIQUE => webhook idempotency. Aynı olay iki kez
-- gelse de stake bir kez yazılır.
CREATE TABLE IF NOT EXISTS payments (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider_event_id TEXT    NOT NULL UNIQUE,
  intent_id         TEXT    NOT NULL REFERENCES intents(id),
  amount_cents      INTEGER NOT NULL,
  status            TEXT    NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Bir checkout yalnız bir başarılı ödeme üretebilir. Farklı webhook event ID'si
-- ile yeniden teslim edilse bile aynı intent ikinci kez krediye dönüşmez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_one_success_per_intent
  ON payments(intent_id) WHERE status = 'succeeded';

-- Append-only. İade/chargeback negatif delta olarak yazılır.
CREATE TABLE IF NOT EXISTS stake_events (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  placement_id      BIGINT  NOT NULL REFERENCES placements(id),
  payment_id        BIGINT  NOT NULL REFERENCES payments(id),
  delta_cents       INTEGER NOT NULL,
  total_after_cents INTEGER NOT NULL,
  -- TRUE ise bu stake nakit değil, paketle verilmiş kredidir.
  -- Nakit mutabakatı bu alanla ayrıştırılır.
  bundled           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Herkese açık akış. DİKKAT: sağlayıcı ödeme kimliği BURAYA GİRMEZ.
CREATE TABLE IF NOT EXISTS activity (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  public_id     TEXT    NOT NULL UNIQUE,
  territory_id  BIGINT  NOT NULL REFERENCES territories(id),
  advertiser_id BIGINT  NOT NULL REFERENCES advertisers(id),
  amount_cents  INTEGER NOT NULL,
  rank_after    INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_act_time ON activity(created_at DESC);

CREATE TABLE IF NOT EXISTS clicks (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  advertiser_id BIGINT NOT NULL REFERENCES advertisers(id),
  territory_id  BIGINT REFERENCES territories(id),
  session_hash  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===========================================================================
-- KATEGORİLER
--
-- Bir yazılım markası bir otomotiv markasını geçmek zorunda kalmasın diye
-- yarış kategori İÇİNDE yapılır. Envanter birimi artık (bölge x kategori):
-- Türkiye'nin #1 yazılımı ile Türkiye'nin #1 otomotivi AYRI slotlardır.
--
-- Birincil anahtar neden slug (id değil): kategori kümesi küçük ve sabit.
-- Slug ile URL parametresi (?cat=software), API gövdesi ve SQL filtresi aynı
-- değeri taşır; hiçbir yerde id çözümlemesi gerekmez.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS categories (
  slug       TEXT PRIMARY KEY,
  name       TEXT    NOT NULL,
  icon       TEXT    NOT NULL DEFAULT '•',
  color      TEXT    NOT NULL DEFAULT '#8ab4f8',
  sort_order INTEGER NOT NULL DEFAULT 100
);

-- Kategori listesinin TEK kaynağı burasıdır; arayüz de bu satırlardan
-- beslenir (ikon/renk dahil). Ekleme yapmak için yeni bir VALUES satırı
-- yeter — kod tarafında değişiklik gerekmez.
INSERT INTO categories (slug, name, icon, color, sort_order) VALUES
  ('software',   'Software & Tech',      '💻', '#7aa2ff', 10),
  ('automotive', 'Automotive',           '🚗', '#ff8f6b', 20),
  ('finance',    'Finance & Crypto',     '💳', '#5ed0a8', 30),
  ('retail',     'Retail & E-commerce',  '🛍️', '#ffb545', 40),
  ('food',       'Food & Drink',         '🍔', '#ff7a9c', 50),
  ('fashion',    'Fashion & Beauty',     '👗', '#d68bff', 60),
  ('health',     'Health & Fitness',     '🩺', '#4ecfd6', 70),
  ('realestate', 'Real Estate',          '🏠', '#a3b18a', 80),
  ('travel',     'Travel & Hospitality', '✈️', '#6cc7ff', 90),
  ('education',  'Education',            '🎓', '#f2c14e', 100),
  ('gaming',     'Gaming & Esports',     '🎮', '#9d7bff', 110),
  ('media',      'Media & Creators',     '🎬', '#ff9ecd', 120),
  ('sports',     'Sports',               '⚽', '#7ddf64', 130),
  ('services',   'Services & B2B',       '🔧', '#9fb3c8', 140),
  ('other',      'Other',                '✨', '#c9d4e3', 999)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name, icon = EXCLUDED.icon,
  color = EXCLUDED.color, sort_order = EXCLUDED.sort_order;

-- Mevcut kurulumlar için: kolon eklenir, eski satırlar 'other' olur.
-- DEFAULT değeri sayesinde geri dolum ayrı bir UPDATE istemez.
ALTER TABLE placements ADD COLUMN IF NOT EXISTS
  category TEXT NOT NULL DEFAULT 'other' REFERENCES categories(slug);
ALTER TABLE intents ADD COLUMN IF NOT EXISTS
  category TEXT NOT NULL DEFAULT 'other' REFERENCES categories(slug);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS
  category TEXT NOT NULL DEFAULT 'other' REFERENCES categories(slug);

-- Slot artık (bölge, reklamveren, kategori). Eski kısıt (bölge, reklamveren)
-- aynı markanın iki kategoride yarışmasını engellerdi.
ALTER TABLE placements DROP CONSTRAINT IF EXISTS placements_territory_id_advertiser_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pl_slot
  ON placements(territory_id, advertiser_id, category);

-- Kategori bazlı sıralama sorgusunun taradığı ana yol.
CREATE INDEX IF NOT EXISTS idx_pl_terr_cat
  ON placements(territory_id, category, total_cents DESC);
