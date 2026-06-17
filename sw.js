// sw.js — network-first, updates immediately
const CACHE = 'stark-v3';

self.addEventListener('install', e => {
  // Skip waiting so the new SW activates immediately
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  // Take control of all open clients right away
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network first — always try live, fall back to cache
  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache a fresh copy
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
