const CACHE_NAME = 'chatly-v2';
const STATIC_CACHE = ['/_next/static/', '/icons/'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) return caches.delete(cache);
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API requests
  if (url.pathname.startsWith('/api/')) return;

  // Cache-first for static assets and icons
  if (STATIC_CACHE.some((p) => url.pathname.includes(p))) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request).then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return networkResponse;
        });
      })
    );
    return;
  }

  // Network-first for navigation (default)
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (event.request.mode === 'navigate') {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', clone));
        }
        return networkResponse;
      })
      .catch(() => caches.match('/'))
  );
});
