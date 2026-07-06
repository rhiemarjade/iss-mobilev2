const BUILD_VERSION = "2026.07.06.2";
const CACHE_NAME = `iss-mobile-pwa-${BUILD_VERSION}`;
const CACHE_PREFIX = "iss-mobile-pwa";
const APP_SHELL = [
    "./",
    "./index.html",
    "./css/styles.css",
    "./css/update-monitor.css",
    "./js/app.js",
    "./js/update-monitor.js",
    "./manifest.webmanifest",
    "./assets/icons/icon-192.png",
    "./assets/icons/icon-512.png",
    "./assets/icons/apple-touch-icon.png"
];

function isAppCache(key) {
    return key && key.startsWith(CACHE_PREFIX);
}

async function deleteAppCaches() {
    const keys = await caches.keys();
    await Promise.all(keys.filter(isAppCache).map((key) => caches.delete(key)));
}

async function freshFetch(request) {
    return fetch(request, { cache: "reload" });
}

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await Promise.all(APP_SHELL.map(async (url) => {
            try {
                const response = await freshFetch(new Request(url, { cache: "reload" }));
                if (response && response.ok) await cache.put(url, response.clone());
            } catch (error) {
                // Keep installing even when one optional asset fails.
            }
        }));
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys
            .filter((key) => isAppCache(key) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener("message", (event) => {
    const type = event.data?.type;
    if (type === "SKIP_WAITING") {
        event.waitUntil(self.skipWaiting());
        return;
    }
    if (type === "CLEAR_ISS_CACHE" || type === "FORCE_UPDATE") {
        event.waitUntil((async () => {
            await deleteAppCaches();
            await self.skipWaiting();
            const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
            for (const client of clients) {
                client.postMessage({ type: "ISS_CACHE_CLEARED", version: BUILD_VERSION });
            }
        })());
    }
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    const noCacheFiles = ["config.js", "version.json", "service-worker.js"];
    if (noCacheFiles.some((name) => url.pathname.endsWith(`/${name}`))) {
        event.respondWith(freshFetch(event.request));
        return;
    }

    const isNavigation = event.request.mode === "navigate";
    const isFreshAsset = /\.(?:html|js|css|webmanifest)$/i.test(url.pathname);

    if (isNavigation || isFreshAsset) {
        event.respondWith((async () => {
            try {
                const response = await freshFetch(event.request);
                const cache = await caches.open(CACHE_NAME);
                cache.put(event.request, response.clone()).catch(() => {});
                return response;
            } catch (error) {
                return caches.match(event.request) || caches.match("./index.html");
            }
        })());
        return;
    }

    event.respondWith((async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        const cache = await caches.open(CACHE_NAME);
        cache.put(event.request, response.clone()).catch(() => {});
        return response;
    })());
});
