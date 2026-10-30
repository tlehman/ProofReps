// ProofReps' service worker. Two jobs:
//
// 1. Cross-origin isolation. Lean's WebAssembly uses SharedArrayBuffer, which
//    browsers only allow on pages served with COOP/COEP headers. GitHub Pages
//    can't set headers, so every response that passes through here gets them.
// 2. Speed and offline. The Lean runtime (~48 MB) is cached on first use and
//    served from the cache after that; so are the hashed app bundles. Pages are
//    network-first, so a deploy shows up on the next visit.
//
// postexport.ts fills in VERSION (a hash of the build) and LEAN (a hash of
// scripts/lean.lock), so a new deploy gets a new app cache, and a new Lean
// runtime a new Lean cache.
const VERSION = "__VERSION__";
const LEAN = "__LEAN__";
const APP_CACHE = `proofreps-app-${VERSION}`;
const LEAN_CACHE = `proofreps-lean-${LEAN}`;
const SCOPE = new URL("./", self.location).pathname; // "/ProofReps/"

self.addEventListener("install", (event) => {
  // The shell, so the app opens offline. Lean is cached as the app boots it.
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((c) => c.addAll([SCOPE, `${SCOPE}core.wasm`, `${SCOPE}lean-worker.js`]))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("proofreps-") && k !== APP_CACHE && k !== LEAN_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isolate(res) {
  if (!res || res.status === 0 || res.type === "opaque") return res;
  const headers = new Headers(res.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

async function cacheFirst(cacheName, req) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(APP_CACHE);
  try {
    const res = await fetch(req, { cache: "no-cache" });
    if (res.ok) await cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = (await cache.match(req, { ignoreSearch: true })) ?? (req.mode === "navigate" ? await cache.match(SCOPE) : undefined);
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;
  const path = url.pathname.slice(SCOPE.length);
  let res;
  if (path.startsWith("lean/")) res = cacheFirst(LEAN_CACHE, req);
  else if (path.startsWith("_expo/static/") || path.startsWith("assets/") || path.startsWith("icons/")) res = cacheFirst(APP_CACHE, req);
  else res = networkFirst(req);
  event.respondWith(res.then(isolate));
});
