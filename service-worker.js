/* Electroingeniería · Service Worker funcional
   Estrategia:
   - HTML y JS principal: network-first para evitar versiones viejas.
   - Assets estáticos: cache-first con actualización.
   - Navegación: si no hay red, devuelve index.html cacheado.
   - Solo maneja archivos del mismo origen, no Firebase/CDN.
*/

var CACHE_VERSION = "ei-trazabilidad-pwa-v1.0.0";
var APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./firebase-config.js",
  "./manifest.json",
  "./assets/logo-electroingenieria.jpeg",
  "./assets/app-icon.svg"
];

function sameOrigin(request) {
  try {
    return new URL(request.url).origin === self.location.origin;
  } catch (e) {
    return false;
  }
}

function isHtmlRequest(request) {
  return request.mode === "navigate" || (request.headers.get("accept") || "").indexOf("text/html") >= 0;
}

function isCoreFile(url) {
  return /\/(index\.html|app\.js|styles\.css|firebase-config\.js|manifest\.json)$/.test(url.pathname);
}

function putInCache(request, response) {
  if (!response || response.status !== 200 || response.type === "opaque") return Promise.resolve(response);
  return caches.open(CACHE_VERSION).then(function(cache) {
    return cache.put(request, response.clone()).then(function() {
      return response;
    });
  }).catch(function() {
    return response;
  });
}

function networkFirst(request) {
  return fetch(request, { cache: "no-store" })
    .then(function(response) {
      return putInCache(request, response);
    })
    .catch(function() {
      return caches.match(request).then(function(cached) {
        if (cached) return cached;
        if (isHtmlRequest(request)) return caches.match("./index.html");
        return cached;
      });
    });
}

function cacheFirst(request) {
  return caches.match(request).then(function(cached) {
    if (cached) {
      fetch(request).then(function(response) {
        putInCache(request, response);
      }).catch(function(){});
      return cached;
    }
    return fetch(request).then(function(response) {
      return putInCache(request, response);
    });
  });
}

self.addEventListener("install", function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) {
      return cache.addAll(APP_SHELL);
    })
  );
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(key) {
        if (key !== CACHE_VERSION && key.indexOf("ei-trazabilidad") === 0) {
          return caches.delete(key);
        }
      }));
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener("message", function(event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "CLEAR_CACHE") {
    event.waitUntil(
      caches.keys().then(function(keys) {
        return Promise.all(keys.map(function(key) { return caches.delete(key); }));
      })
    );
  }
});

self.addEventListener("fetch", function(event) {
  var request = event.request;
  if (request.method !== "GET") return;
  if (!sameOrigin(request)) return;

  var url = new URL(request.url);

  if (isHtmlRequest(request) || isCoreFile(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
