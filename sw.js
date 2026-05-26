/**
 * TAYFUN BÜTÇE - Çevrimdışı Çalışma ve Önbellek Yönetimi
 */
const CACHE_NAME = 'tayfun-butce-v2';
const assetsToCache = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Uygulama Kurulum Aşaması (Önbelleğe Alma)
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(assetsToCache);
        })
    );
});

// Veri İsteklerini Yakalama Politikası (Önce Önbellek, Yoksa Ağ Kontrolü)
self.addEventListener('fetch', e => {
    e.respondWith(
        caches.match(e.request).then(cachedResponse => {
            return cachedResponse || fetch(e.request);
        })
    );
});

// Eski Önbellek Sürümlerini Temizleme Filtresi
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
});
