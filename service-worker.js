// ======================================================
// SERVICE WORKER
// STATUS: Aktif
// ======================================================
// v6: perbaikan offline-support —
// 1) precache logo & ikon yang sebelumnya tidak masuk daftar
// 2) precache aset CDN (font, ikon, cropperjs) supaya app tetap
//    tampil normal saat offline
// 3) runtime cache dulu hanya menyimpan response berstatus 200,
//    padahal resource cross-origin yang dimuat tanpa atribut
//    crossorigin akan datang sebagai response "opaque" (status 0),
//    jadi selalu gagal ke-cache. Sekarang opaque response juga disimpan.
// v7: js/notifikasi.js kelewat dari daftar precache padahal dimuat
//    di index.html sebelum app.js — ditambahkan supaya modul
//    pengingat tidak gagal load saat offline.

const CACHE_NAME = 'keluang-v7';

// Aset lokal (same-origin) — aman di-precache dengan cache.addAll
const LOCAL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './style.css',
  './app.js',
  './notifikasi.js',
  './akun.js',
  './statistik.js',
  './settings.js',
  './budget.js',
  './wishlist.js',
  './dana-darurat.js',
  './jurnal-investasi.js',
  './utang-piutang.js',
  './riwayat.js',
  './datepicker.js',
  './storage.js',
  './icon.png',
  './logo-keluang.png'
];

// Aset CDN eksternal (font, ikon, cropperjs) — dicache satu per satu
// dengan mode 'no-cors' supaya tetap tersimpan meski responnya opaque,
// dan kegagalan salah satu URL tidak menggagalkan seluruh instalasi.
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
  'https://cdn-uicons.flaticon.com/4.0.0/uicons-solid-straight/css/uicons-solid-straight.css',
  'https://cdn-uicons.flaticon.com/4.0.0/uicons-solid-rounded/css/uicons-solid-rounded.css',
  'https://cdn-uicons.flaticon.com/4.0.0/uicons-bold-rounded/css/uicons-bold-rounded.css',
  'https://cdn-uicons.flaticon.com/4.0.0/uicons-solid-chubby/css/uicons-solid-chubby.css',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.js'
];

// ======================================================
// INSTALL
// ======================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(LOCAL_ASSETS);
      // Precache CDN satu-satu; kalau satu gagal (mis. offline saat
      // instalasi), yang lain tetap lanjut, tidak menggagalkan install.
      await Promise.allSettled(
        CDN_ASSETS.map((url) =>
          fetch(url, { mode: 'no-cors' }).then((res) => cache.put(url, res))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ======================================================
// ACTIVATE
// ======================================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// ======================================================
// FETCH — cache-first, lalu simpan hasil network (termasuk
// response opaque dari CDN) untuk dipakai lagi saat offline.
// ======================================================
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request)
        .then((response) => {
          // Simpan response yang berhasil: status 200 (same-origin)
          // ATAU response opaque (status 0, khas resource cross-origin
          // yang dimuat tanpa atribut crossorigin, mis. <link>/<script>).
          if (!response || (response.status !== 200 && response.type !== 'opaque')) {
            return response;
          }
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return response;
        })
        .catch(() => cachedResponse);
    })
  );
});
