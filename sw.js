// Önbellek adı ve önbelleğe alınacak temel dosyalar
const CACHE_NAME = 'butce-app-dark-v1';
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Service Worker Kurulumu (Install)
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Dosyalar önbelleğe alınıyor.');
                return cache.addAll(urlsToCache);
            })
    );
});

// İnternet İsteklerini Yakalama (Fetch)
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // Eğer istenen dosya önbellekte varsa onu döndür, yoksa internetten indir
                return response || fetch(event.request);
            })
    );
});

// Eski Önbellekleri Temizleme (Activate)
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});