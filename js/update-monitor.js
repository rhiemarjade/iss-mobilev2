(() => {
    "use strict";

    const APP_VERSION = "2026.07.06.1";
    const VERSION_URL = "./version.json";
    const CHECK_INTERVAL_MS = 30 * 60 * 1000;
    const DISMISS_KEY = "issMobileUpdateDismissedVersion";
    const UPDATE_PENDING_KEY = "issMobileUpdatePendingVersion";
    let lastCheck = 0;
    let latestInfo = null;

    window.ISS_MOBILE_VERSION = APP_VERSION;

    function clean(value) {
        return String(value ?? "").trim();
    }

    function compareVersions(a, b) {
        const left = clean(a).split(/[^0-9A-Za-z]+/).filter(Boolean);
        const right = clean(b).split(/[^0-9A-Za-z]+/).filter(Boolean);
        const length = Math.max(left.length, right.length);
        for (let i = 0; i < length; i += 1) {
            const x = left[i] || "0";
            const y = right[i] || "0";
            const nx = Number(x);
            const ny = Number(y);
            if (Number.isFinite(nx) && Number.isFinite(ny) && /^\d+$/.test(x) && /^\d+$/.test(y)) {
                if (nx !== ny) return nx > ny ? 1 : -1;
            } else {
                const cmp = x.localeCompare(y, undefined, { sensitivity: "base", numeric: true });
                if (cmp !== 0) return cmp > 0 ? 1 : -1;
            }
        }
        return 0;
    }

    function toast(message) {
        const existing = document.querySelector(".update-monitor-toast");
        if (existing) existing.remove();
        const el = document.createElement("div");
        el.className = "update-monitor-toast";
        el.textContent = message;
        document.body.appendChild(el);
        window.setTimeout(() => el.remove(), 2600);
    }

    function removeBanner() {
        const existing = document.querySelector(".update-monitor-banner");
        if (existing) existing.remove();
    }

    function showUpdateBanner(info) {
        if (!info?.version) return;
        if (sessionStorage.getItem(DISMISS_KEY) === info.version) return;
        removeBanner();

        const banner = document.createElement("div");
        banner.className = "update-monitor-banner";
        banner.setAttribute("role", "dialog");
        banner.setAttribute("aria-live", "polite");
        banner.innerHTML = `
            <p class="update-monitor-title">Update available</p>
            <p class="update-monitor-text">Download the latest ISS Mobile copy.</p>
            <div class="update-monitor-actions">
                <button type="button" class="update-monitor-later-btn">Later</button>
                <button type="button" class="update-monitor-update-btn">Update now</button>
            </div>
        `;
        document.body.appendChild(banner);

        banner.querySelector(".update-monitor-later-btn")?.addEventListener("click", () => {
            sessionStorage.setItem(DISMISS_KEY, info.version);
            removeBanner();
        });
        banner.querySelector(".update-monitor-update-btn")?.addEventListener("click", () => updateNow(info));
    }

    async function fetchLatestVersion() {
        const response = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
            cache: "no-store",
            headers: { "Cache-Control": "no-cache" }
        });
        if (!response.ok) throw new Error("Unable to check version.");
        return response.json();
    }

    async function checkForUpdates(force = false) {
        const now = Date.now();
        if (!force && now - lastCheck < CHECK_INTERVAL_MS) return;
        lastCheck = now;
        try {
            const info = await fetchLatestVersion();
            latestInfo = info;
            const latest = clean(info?.version);
            if (latest && compareVersions(latest, APP_VERSION) > 0) {
                showUpdateBanner(info);
            } else if (localStorage.getItem(UPDATE_PENDING_KEY)) {
                localStorage.removeItem(UPDATE_PENDING_KEY);
                toast("ISS Mobile is updated.");
            }
        } catch (error) {
            if (force) toast("Unable to check for updates.");
            console.warn("ISS Mobile update check failed:", error);
        }
    }

    async function clearAppCaches() {
        if (!("caches" in window)) return;
        const keys = await caches.keys();
        await Promise.all(keys
            .filter((key) => key.startsWith("iss-mobile-pwa"))
            .map((key) => caches.delete(key)));
    }

    function wait(ms) {
        return new Promise((resolve) => window.setTimeout(resolve, ms));
    }

    async function waitForControllerChange(timeoutMs = 2500) {
        if (!("serviceWorker" in navigator)) return;
        await Promise.race([
            new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true })),
            wait(timeoutMs)
        ]);
    }

    async function forceServiceWorkerUpdate() {
        if (!("serviceWorker" in navigator)) return;
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(async (registration) => {
            try {
                await registration.update();
                if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
                if (registration.active) registration.active.postMessage({ type: "FORCE_UPDATE" });
            } catch (error) {
                console.warn("Service worker update failed:", error);
            }
        }));
        await waitForControllerChange();
    }

    async function unregisterServiceWorkers() {
        if (!("serviceWorker" in navigator)) return;
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
    }

    async function warmLatestFiles(version) {
        const tag = encodeURIComponent(version || String(Date.now()));
        const files = [
            "./index.html",
            "./service-worker.js",
            "./js/app.js",
            "./js/update-monitor.js",
            "./css/styles.css",
            "./css/update-monitor.css",
            "./manifest.webmanifest"
        ];
        await Promise.all(files.map((file) => fetch(`${file}?v=${tag}&t=${Date.now()}`, {
            cache: "reload",
            headers: { "Cache-Control": "no-cache" }
        }).catch(() => null)));
    }

    async function updateNow(info = latestInfo) {
        const version = clean(info?.version) || String(Date.now());
        removeBanner();
        toast("Downloading update...");
        localStorage.setItem(UPDATE_PENDING_KEY, version);
        try {
            await forceServiceWorkerUpdate();
            await clearAppCaches();
            await unregisterServiceWorkers();
            await warmLatestFiles(version);
        } catch (error) {
            console.warn("ISS Mobile forced update failed:", error);
        } finally {
            const url = new URL(window.location.href);
            url.searchParams.set("update", version);
            url.searchParams.set("t", String(Date.now()));
            window.location.replace(url.toString());
        }
    }

    window.ISS_MOBILE_UPDATE = {
        version: APP_VERSION,
        check: () => checkForUpdates(true),
        updateNow
    };

    window.addEventListener("online", () => checkForUpdates(true));
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) checkForUpdates(false);
    });
    window.addEventListener("load", () => {
        window.setTimeout(() => checkForUpdates(true), 900);
        window.setInterval(() => checkForUpdates(false), CHECK_INTERVAL_MS);
    });
})();
