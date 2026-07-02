const CACHE_NAME = 'stark-track-v2';

const APP_SHELL = [
  './',
  './manifest.json',
  './stark-icon-192.png',
  './stark-icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  const requestUrl = new URL(url);

  // School Records Google Doc — network first, fall back to cache.
  // The app appends a "?t=<minute>" bust param, so strip it and cache
  // under the clean URL: exactly one stored copy, overwritten in place,
  // and the offline fallback can actually find it. (Caching by the raw
  // URL would store a new copy per minute and never match offline —
  // the same bug fixed in the Perry app's service worker.)
  if (url.includes('docs.google.com')) {
    const cleanUrl = new URL(url);
    cleanUrl.searchParams.delete('t');
    const cacheKey = new Request(cleanUrl.href);
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, clone));
          }
          return response;
        })
        .catch(() => caches.match(cacheKey))
    );
    return;
  }

  // Hytek result files (.htm) — stale-while-revalidate: serve the cached
  // copy instantly and refresh it in the background. These are historical
  // meet results that essentially never change, but a correction to a file
  // still propagates on the NEXT visit. This makes the Top 25 / Dream Meet
  // pages (which pull all ~24 files at once) load near-instantly on repeat
  // visits, and fully offline.
  if (requestUrl.pathname.toLowerCase().endsWith('.htm')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const network = fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached); // offline: fall back to cache (or fail if none)
        return cached || network;
      })
    );
    return;
  }

  // Main HTML page — network first so updates show immediately, cache
  // fallback for offline. request.mode === 'navigate' catches every page
  // load regardless of URL shape; cache under the bare path so query
  // strings don't create duplicate copies.
  const isPageNavigation = event.request.mode === 'navigate' ||
    requestUrl.pathname.endsWith('/') || requestUrl.pathname.endsWith('.html');

  if (isPageNavigation) {
    const cacheKey = new Request(requestUrl.origin + requestUrl.pathname);
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true }))
    );
    return;
  }

  // Everything else (school logos, icons, manifest) — cache first.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
