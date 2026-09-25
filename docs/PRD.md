# PRD — Feature Flag & A/B Testing Service

## 1. Latar Belakang

Tim produk perlu menyalakan/mematikan fitur dan menjalankan eksperimen A/B
tanpa deploy ulang aplikasi — cukup lewat dashboard, dan perubahan langsung
berlaku bagi klien yang memanggil endpoint evaluasi flag.

## 2. Tujuan

1. **Toggle fitur tanpa redeploy** — dashboard admin bisa menyalakan/
   mematikan flag, aplikasi klien membaca status terbaru lewat API tanpa
   perlu build/deploy baru.
2. **Gradual rollout** (10% → 50% → 100%) — flag boolean bisa diaktifkan
   bertahap ke sebagian pengguna, dan penambahan persentase harus
   **monoton**: pengguna yang sudah dapat fitur di 10% tidak boleh
   "kehilangan" fitur saat rollout naik ke 50%.
3. **Assignment variant konsisten per pengguna** — untuk eksperimen A/B
   (multi-variant), satu pengguna harus selalu mendapat variant yang sama
   setiap kali dievaluasi, bahkan setelah alokasi traffic diubah admin di
   tengah eksperimen (agar data konversi tidak tercemar oleh pengguna yang
   "pindah kelompok").
4. **Grafik konversi per variant** — dashboard menampilkan jumlah exposure
   (berapa kali variant ditampilkan) vs konversi per variant, dengan
   tingkat konversi (%) untuk membandingkan performa antar-variant.

## 3. Solusi Teknis — dua mekanisme konsistensi yang berbeda secara sengaja

Proyek ini memakai **dua strategi berbeda** untuk dua kasus yang secara
prinsip berbeda, bukan satu mekanisme generik untuk semuanya:

### 3.1 Flag boolean (gradual rollout) — hash deterministik LIVE, tanpa penyimpanan

```
bucket = hash(flagKey + ":" + userId) % 100        // 0-99, deterministik
enabled = bucket < flag.rolloutPercentage
```

Tidak ada assignment yang disimpan. Setiap evaluasi menghitung ulang
`bucket` (selalu sama untuk kombinasi flag+user yang sama, karena hash
deterministik) dan membandingkannya dengan `rolloutPercentage` **saat itu
juga**. Ini otomatis memberi sifat **monoton**: jika `bucket` seorang
pengguna adalah 7, ia sudah `enabled=true` begitu rollout mencapai 10%
(7 < 10), dan TETAP `true` saat rollout naik ke 50% atau 100% (7 masih
< 50, < 100) — tanpa perlu logika tambahan, cukup dari sifat matematis
perbandingan `bucket < threshold` yang naik.

### 3.2 Flag eksperimen (A/B multi-variant) — assignment tersimpan (sticky)

```
Assignment(flagId, userId) -> variantId   [UNIQUE constraint, dibuat sekali]
```

Saat pengguna PERTAMA kali dievaluasi pada flag eksperimen, variant
dipilih via hash deterministik terhadap alokasi traffic saat itu, lalu
**disimpan permanen**. Evaluasi berikutnya untuk pengguna yang sama
membaca assignment tersimpan, BUKAN menghitung ulang — sehingga meskipun
admin mengubah alokasi traffic di tengah eksperimen (mis. 50/50 menjadi
70/30), pengguna yang sudah masuk grup "treatment" tetap di grup itu.
Ini krusial untuk validitas eksperimen: kalau pengguna bisa "pindah
kelompok" karena alokasi berubah, data konversi per variant jadi bias.

## 4. Model Data (ringkas)

- `Flag` — `key` (unik), `type` (`BOOLEAN`/`EXPERIMENT`), `enabled`
  (matikan-total, override semuanya jadi off), `rolloutPercentage`
  (untuk `BOOLEAN`).
- `Variant` — `flagId`, `key`, `trafficPercentage` (untuk `EXPERIMENT`).
- `Assignment` — assignment tersimpan untuk flag `EXPERIMENT` (lihat 3.2).
- `Event` — `EXPOSURE` (flag dievaluasi & ditampilkan) atau `CONVERSION`
  (aksi target tercapai), dikaitkan ke variant — dasar grafik konversi.

## 5. Verifikasi yang direncanakan

- `verify-gradual-rollout.ts` — 1000 user id disimulasikan pada flag
  rollout 10%, memverifikasi ~10% yang `enabled=true` (distribusi
  statistik nyata, bukan asumsi); lalu rollout dinaikkan ke 50%,
  memverifikasi SEMUA user yang sudah `enabled=true` di 10% tetap
  `enabled=true` di 50% (monoton, dites langsung pada himpunan user yang
  sama, bukan sampel baru).
- `verify-consistent-assignment.ts` — satu user dievaluasi 20 kali
  berturut-turut pada flag eksperimen, memverifikasi variant yang
  didapat identik di semua 20 panggilan; lalu alokasi traffic diubah
  admin, user yang sama dievaluasi lagi, memverifikasi variant TETAP
  sama (assignment sticky, tidak terpengaruh perubahan alokasi).
- `verify-conversion-stats.ts` — simulasi banyak exposure dan konversi
  dengan rasio berbeda per variant, memverifikasi angka pada endpoint
  statistik (`exposures`, `conversions`, `conversionRate`) sama persis
  dengan yang dihitung manual dari event yang dikirim.

## 6. Di luar cakupan (v1)

- Signifikansi statistik (p-value, confidence interval) — v1 cukup
  menampilkan rasio konversi mentah per variant.
- Targeting berbasis atribut pengguna (negara, versi app, dst) — v1
  rollout/assignment murni berbasis hash `userId`.
- SDK client resmi (JS/mobile) — v1 cukup REST API yang bisa dipanggil
  klien mana pun.
