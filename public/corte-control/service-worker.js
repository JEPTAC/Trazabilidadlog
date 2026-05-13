const CACHE_NAME = 'control-corte-cable-v4-8-0';
const ASSETS = ['./manifest.json','./icon-192.png','./icon-512.png','./logo-electroingenieria.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(() => caches.open(CACHE_NAME)).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))) .then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const req = event.request;
  const isPage = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isPage) {
    event.respondWith(fetch(req, {cache:'no-store'}).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(fetch(req).then(networkResp => {
    const copy = networkResp.clone();
    caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
    return networkResp;
  }).catch(() => caches.match(req)));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(clients.matchAll({type:'window', includeUncontrolled:true}).then(clientList => {
    for (const client of clientList) {
      if ('focus' in client) return client.focus();
    }
    if (clients.openWindow) return clients.openWindow(targetUrl);
  }));
});
