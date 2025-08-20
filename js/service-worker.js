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
  '/images/logo.png',
  '/images/icon-192.png',
  '/images/icon-512.png'
];

// Install - cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE_ASSETS);
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

      // Return cached response immediately if available, otherwise wait for network
      if (cachedResponse) {
        // Update cache in background
        fetchPromise;
        return cachedResponse;
      }

      const networkResponse = await fetchPromise;
      if (networkResponse) return networkResponse;

      // Fallback to offline.html if HTML page
      if (event.request.headers.get('accept')?.includes('text/html')) {
        return caches.match('/offline.html');
      }
    })()
  );
});
