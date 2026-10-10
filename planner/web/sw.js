// Service Worker：缓存应用壳，离线时回退到已缓存页面。
const CACHE_NAME = "student-planner-os-v1";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.mjs",
  "./manifest.webmanifest",
  "./lib/idb.mjs",
  "./lib/archive.mjs",
  "./lib/ai-vault.mjs",
  "./lib/ai-client.mjs",
  "./lib/audit.mjs",
  "./lib/brief.mjs",
  "./lib/chatbox.mjs",
  "./lib/goals.mjs",
  "./lib/proposal.mjs",
  "./lib/tavily.mjs",
  "./lib/validation.mjs",
  "./lib/zip.mjs",
  "../src/engine.mjs",
  "../src/schema.mjs",
  "../seed/config.json",
  "../seed/goals.json",
  "../seed/tasks.json",
  "../seed/sources.json",
  "../seed/decisions.json",
  "../seed/schedule.json"
];

self.addEventListener("install", (event) => {
  // 安装阶段预缓存核心资源，完成后立即激活新版本。
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  // 清理旧缓存，避免不同应用版本混用。
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // 只处理同源 GET；网络优先更新缓存，离线时使用最近一次缓存。
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached ?? caches.match("./index.html"));
      return cached ?? network;
    })
  );
});
