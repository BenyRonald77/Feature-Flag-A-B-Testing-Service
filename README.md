# Feature Flag & A/B Testing Service

Layanan feature flag dan A/B testing: toggle fitur tanpa redeploy, gradual
rollout dengan jaminan monotonicity, assignment variant yang konsisten per
pengguna untuk eksperimen A/B, dan statistik konversi per variant.

Lihat [`docs/PRD.md`](docs/PRD.md) untuk latar belakang dan tujuan produk
secara lengkap.

## Arsitektur

Next.js 14 App Router + TypeScript + Prisma (SQLite) + Tailwind CSS. Tidak
ada custom server — semua evaluasi flag berjalan lewat API route biasa,
karena tidak ada kebutuhan realtime/websocket di layanan ini.

### Model data (`prisma/schema.prisma`)

- `Admin` — akun untuk dashboard.
- `Flag` — `key` (unik), `type` (`BOOLEAN` | `EXPERIMENT`), `enabled`
  (saklar total, override semuanya jadi off), `rolloutPercentage` (dipakai
  untuk `BOOLEAN`).
- `Variant` — milik satu `Flag` bertipe `EXPERIMENT`, punya
  `trafficPercentage`.
- `Assignment` — assignment variant yang tersimpan permanen per
  `(flagId, userId)`, unique constraint mencegah duplikasi.
- `Event` — `EXPOSURE` atau `CONVERSION`, selalu menyimpan `variantKey`
  (untuk `BOOLEAN`: `"enabled"`/`"disabled"`; untuk `EXPERIMENT`: key
  variant) sehingga statistik bisa di-groupBy tanpa join tambahan.

### Dua mekanisme konsistensi yang berbeda secara sengaja

Inti dari layanan ini adalah **dua strategi berbeda untuk dua kasus yang
secara prinsip berbeda**, bukan satu mekanisme generik dipaksakan untuk
keduanya.

#### 1. Flag `BOOLEAN` (gradual rollout) — hash deterministik LIVE, tanpa disimpan

```ts
// src/lib/hash-bucket.ts
function hashBucket(flagKey: string, userId: string): number {
  const hash = createHash("sha256").update(`${flagKey}:${userId}`).digest();
  return hash.readUInt32BE(0) % 100; // 0-99, deterministik
}

// src/lib/evaluation-service.ts
const bucket = hashBucket(flag.key, userId);
const enabled = bucket < flag.rolloutPercentage; // dihitung ulang setiap evaluasi
```

Tidak ada assignment yang disimpan ke database untuk flag `BOOLEAN`. Setiap
kali dievaluasi, `bucket` dihitung ulang (selalu sama untuk kombinasi
flag+user yang sama karena hash-nya deterministik) dan dibandingkan dengan
`rolloutPercentage` **saat itu juga**. Ini otomatis memberi sifat
**monoton**: kalau `bucket` seorang user adalah 7, dia sudah
`enabled=true` begitu rollout mencapai 10% (`7 < 10`), dan TETAP `true`
saat rollout naik ke 50% atau 100% (`7 < 50`, `7 < 100`) — murni dari
sifat matematis "bucket tetap, threshold naik", tanpa logika tambahan atau
penyimpanan state apa pun.

#### 2. Flag `EXPERIMENT` (A/B multi-variant) — assignment tersimpan (sticky)

```ts
// src/lib/evaluation-service.ts — pickVariantForUser()
const existing = await prisma.assignment.findUnique({
  where: { flagId_userId: { flagId, userId } },
});
if (existing) return existing.variant; // SELALU pakai assignment lama kalau sudah ada

// baru dihitung + disimpan kalau BELUM pernah di-assign
const bucket = hashBucket(flagKey, userId);
// ... pilih variant berdasar cumulative trafficPercentage ...
await prisma.assignment.create({ data: { flagId, userId, variantId: chosen.id } });
```

Saat pengguna PERTAMA kali dievaluasi pada flag eksperimen, variant dipilih
via hash terhadap alokasi traffic *saat itu*, lalu **disimpan permanen**
sebagai `Assignment`. Evaluasi berikutnya untuk user yang sama membaca
assignment tersimpan, BUKAN menghitung ulang — sehingga walau admin
mengubah alokasi traffic di tengah eksperimen (mis. 50/50 → 1/99), user
yang sudah masuk grup tertentu **tetap** di grup itu. Ini krusial untuk
validitas eksperimen: kalau user bisa "pindah kelompok" gara-gara alokasi
berubah, data konversi per variant jadi bias dan tidak bisa dipercaya.

Race condition ditangani dengan menangkap error `P2002` (unique constraint
violation) dari `prisma.assignment.create()`: kalau dua request paralel
sama-sama mencoba membuat assignment untuk user yang sama, yang kalah race
akan membaca ulang assignment milik pemenang race, bukan memakai hasil
hitungannya sendiri — menjamin satu user selalu berakhir di SATU variant
walau dievaluasi bersamaan dari banyak request.

### Endpoint publik (dipanggil aplikasi klien)

- `GET /api/evaluate?flagKey=...&userId=...` — mengevaluasi flag untuk satu
  user, mencatat `Event` tipe `EXPOSURE`, mengembalikan
  `{ enabled, variantKey }`. `force-dynamic` agar tidak pernah di-cache
  statis oleh Next.js.
- `POST /api/events` — mencatat `Event` tipe `CONVERSION` untuk
  `(flagKey, userId)`; membaca variant dari assignment tersimpan
  (eksperimen) atau menghitung ulang bucket (boolean), sehingga konversi
  selalu terkait variant yang benar meski dikirim terpisah dari exposure.

### Dashboard admin (butuh login)

- `/login` — autentikasi admin (JWT httpOnly cookie).
- `/dashboard` — daftar flag dengan badge tipe/status, form buat flag baru.
- `/dashboard/flags/[id]` — toggle enabled, slider rollout percentage
  (`BOOLEAN`), tambah/edit alokasi traffic variant (`EXPERIMENT`), tabel
  statistik konversi per variant.

## Verifikasi fungsional (dijalankan terhadap server live, bukan review kode)

Tiga skrip di `scripts/` dijalankan terhadap dev server yang benar-benar
hidup di `localhost:3000`, memakai flag/data khusus yang dibuat dan
dibersihkan sendiri oleh masing-masing skrip agar tidak mencemari data
seed.

### `verify-gradual-rollout.ts` — LULUS

1000 user disimulasikan pada flag `BOOLEAN` dengan `rolloutPercentage=10`:
**96/1000 (9.6%)** enabled — dalam toleransi ±3% dari target. Rollout lalu
dinaikkan ke 50%, dievaluasi ulang pada 1000 user YANG SAMA: **507/1000
(50.7%)** enabled, dengan **0 pelanggaran monotonicity** (tidak ada satu
pun user yang enabled di 10% menjadi disabled di 50%).

### `verify-consistent-assignment.ts` — LULUS

Satu user dievaluasi 20 kali berturut-turut pada flag eksperimen →
variant yang sama di semua 20 panggilan. Admin lalu mengubah alokasi
traffic variant tersebut secara drastis (misal dari 50% ke 1%), user yang
sama dievaluasi lagi 10 kali → **tetap** variant semula (sticky, tidak
terpengaruh perubahan alokasi). Sebagai kontrol, 500 user BARU (yang belum
pernah di-assign) dievaluasi setelah perubahan alokasi: **496/500 (99.2%)**
mengikuti alokasi baru — membuktikan hanya assignment yang SUDAH ADA yang
sticky, bukan seluruh sistem "macet" di alokasi lama.

### `verify-conversion-stats.ts` — LULUS

200 user diekspos ke flag eksperimen (96 masuk `control`, 104 masuk
`treatment` — pembagian asli dari hash, bukan dipaksa 50/50). Konversi
dikirim dengan rasio yang **diketahui persis**: 20% dari `control` (19
user) dan 50% dari `treatment` (52 user). Endpoint `/stats` mengembalikan
angka yang **cocok persis** dengan yang dihitung manual dari skrip:
`control`: 96 exposure / 19 konversi / 19.79% rate; `treatment`: 104
exposure / 52 konversi / 50.00% rate.

Jalankan sendiri:

```bash
npm run dev   # di terminal lain, biarkan berjalan
npx tsx scripts/verify-gradual-rollout.ts
npx tsx scripts/verify-consistent-assignment.ts
npx tsx scripts/verify-conversion-stats.ts
```

## Verifikasi UI (browser nyata via Playwright)

Selain skrip backend, dashboard diuji langsung di browser Chromium
sungguhan terhadap dev server live: login → dashboard → buka flag →
toggle enabled (state berubah dan tersimpan) → buka flag eksperimen →
ubah traffic percentage variant lewat input (tersimpan setelah blur) →
tambah variant baru lewat form (langsung muncul di daftar). Tidak ada
error console selain 404 favicon yang tidak relevan.

## Setup lokal

```bash
npm install
cp .env.example .env      # isi JWT_SECRET dengan string acak
npx prisma db push
npx tsx prisma/seed.ts
npm run dev
```

Login dashboard: `admin@flags.dev` / `password123`

Data seed: flag `new-checkout` (`BOOLEAN`, rollout 10%) dan
`homepage-hero` (`EXPERIMENT`, variant `control`/`treatment` 50/50).

## Build production

```bash
npm run build
npm run start
```

Build production sudah diverifikasi berjalan bersih (`next build` tanpa
error/warning, semua route API ter-render sebagai dynamic function seperti
seharusnya, halaman dashboard sebagai static/dynamic sesuai kebutuhan) dan
server production diverifikasi merespons `200` pada halaman utama, login,
dan endpoint `/api/evaluate`.

## Bug yang ditemukan & diperbaiki selama pengembangan

Tidak ada bug signifikan yang ditemukan selama verifikasi — desain dua
mekanisme (hash live vs assignment tersimpan) terbukti benar sejak
implementasi pertama pada ketiga skrip verifikasi. Satu perbaikan kecil:
skrip `verify-consistent-assignment.ts` awalnya mengalami TypeScript error
karena `variantKey` bertipe `string | null` dipakai langsung sebagai nilai
filter Prisma (`key: assignedVariant`) tanpa null-check — diperbaiki dengan
menambahkan guard `if (!assignedVariant) throw ...` sebelum digunakan.
