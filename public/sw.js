/* KORA's deliberately small offline shell. Bump the version when these assets change. */
const CACHE_PREFIX = "kora-public-";
const CACHE_NAME = `${CACHE_PREFIX}2026-09-24-v3`;
const PUBLIC_ASSETS = [
  // Cloudflare's clean URL avoids the redirect from the physical offline.html file.
  "/offline",
  "/favicon.svg",
  "/icons/kora-192.png",
  "/icons/kora-512.png",
  "/icons/kora-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/fonts/manrope-0.ttf",
  "/fonts/manrope-4.ttf",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Only fixed, public assets; no cookies, user data, HTML routes or application chunks.
    // Stage every response before writing so a failed download cannot activate a partial shell.
    const entries = await Promise.all(PUBLIC_ASSETS.map(async (path) => {
      const response = await fetch(new Request(new URL(path, self.location.origin), {
        credentials: "omit", cache: "reload",
      }));
      const type = response.headers.get("Content-Type") || "";
      const expectedType = path === "/offline" ? "text/html" : path.endsWith(".svg") ? "image/svg+xml" : path.endsWith(".png") ? "image/png" : "font/";
      const validType = type.includes(expectedType) || (path.endsWith(".ttf") && type.includes("application/octet-stream"));
      if (!response.ok || response.redirected || !validType || /private|no-store/i.test(response.headers.get("Cache-Control") || "") || response.headers.has("Set-Cookie")) {
        throw new Error(`Unable to cache public KORA asset: ${path}`);
      }
      return [path, response];
    }));
    await Promise.all(entries.map(([path, response]) => cache.put(path, response)));
    // Updates remain waiting until all old tabs close or a visitor chooses Update & reload.
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "KORA_APPLY_UPDATE" && event.source?.type === "window" && new URL(event.source.url).origin === self.location.origin) {
    event.waitUntil(self.skipWaiting());
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  // Personal requests and React Server Component payloads always reach the network.
  // Never replay a mutation or return an offline page as an API/RSC response.
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || request.headers.has("Authorization") || request.headers.has("RSC") || request.headers.has("Next-Router-State-Tree") || request.headers.has("Next-Router-Prefetch") || request.headers.get("Accept")?.includes("text/x-component") || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        // All live pages are network-only, including cart, account and quote forms.
        return await fetch(request);
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const offline = await cache.match("/offline");
        return new Response(offline ? offline.body : "KORA is offline. Reconnect and reload to continue. No request has been sent.", {
          status: 503,
          statusText: "Offline",
          headers: { "Content-Type": offline ? "text/html; charset=utf-8" : "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
    })());
    return;
  }

  if (!url.search && PUBLIC_ASSETS.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(url.pathname) || fetch(new Request(request, { credentials: "omit" }));
    })());
  }
  // All other assets pass through. No runtime cache means no stale JS across deployments.
});
