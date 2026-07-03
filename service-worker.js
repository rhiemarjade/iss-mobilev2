const CACHE_NAME = "iss-mobile-pwa-v1";
const CORE_ASSETS = [
    "./",
    "./index.html",
    "./css/styles.css",
    "./js/app.js",
    "./manifest.webmanifest",
    "./assets/icons/icon-192.png",
    "./assets/icons/icon-512.png",
    "./assets/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);

    if (url.pathname.endsWith("/config.js")) {
        event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
        return;
    }

    if (event.request.method !== "GET") return;

    event.respondWith(
        caches.match(event.request).then((cached) => {
            return cached || fetch(event.request).then((response) => {
                const copy = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
                return response;
            });
        }).catch(() => caches.match("./index.html"))
    );
});
