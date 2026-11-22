/* Cache de estáticos para visitas repetidas e picos de tráfego.
   HTML vai sempre à rede; imagens e o menu revalidam em segundo plano. */
const VER = 'aq-ops87';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VER);
    await cache.addAll(['./', './catalog.json']).catch(() => {});
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VER).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isAsset = /\/assets\//.test(path) || /\.(webp|jpe?g|png|gif|svg|woff2?)$/i.test(path);
  const isStatic = /\.(js|css)$/i.test(path) || /\/catalog\.json$/i.test(path);
  const isNav = req.mode === 'navigate' || path.endsWith('.html') || path === '/' || path.endsWith('/');

  if (isAsset) {
    event.respondWith((async () => {
      const cache = await caches.open(VER);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  if (isStatic) {
    event.respondWith((async () => {
      const cache = await caches.open(VER);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => hit);
      return hit || net;
    })());
    return;
  }

  if (isNav) {
    event.respondWith(
      fetch(req).catch(() => caches.match('./').then((r) => r || caches.match('./index.html')))
    );
  }
});
