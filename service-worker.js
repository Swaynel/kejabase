const CACHE_NAME = 'kejabase-v1';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/browse.html',
  '/bnb.html',
  '/offline.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/firebase.js',
  '/js/state.js',
  '/images/icon-192.png',
  '/images/icon-512.png'
];

// Install - cache core assets individually
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      for (const asset of CORE_ASSETS) {
        try {
          await cache.add(asset);
          console.log('[Service Worker] Cached:', asset);
        } catch (err) {
          console.error('[Service Worker] Failed to cache:', asset, err);
        }
      }
      self.skipWaiting();
    })()
  );
});

// Activate - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map(key => key !== CACHE_NAME && caches.delete(key))
      );
      self.clients.claim();
      console.log('[Service Worker] Activated and old caches cleared');
    })()
  );
});

// Fetch - stale-while-revalidate strategy
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await caches.match(event.request);

      const fetchPromise = fetch(event.request)
        .then(response => {
          // Only cache valid same-origin responses
          if (response && response.status === 200 && response.type === 'basic') {
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => null); // network failed

      if (cachedResponse) {
        fetchPromise; // update cache in background
        return cachedResponse;
      }

      const networkResponse = await fetchPromise;
      if (networkResponse) return networkResponse;

      // Fallback to offline page for HTML requests
      if (event.request.headers.get('accept')?.includes('text/html')) {
        return caches.match('/offline.html');
      }
    })()
  );
});
