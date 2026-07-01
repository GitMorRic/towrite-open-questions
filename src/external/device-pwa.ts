export function buildDeviceManifest(): string {
  return JSON.stringify({
    name: "ToWrite Device",
    short_name: "ToWrite",
    description: "Small-screen ToThink, ToWrite, and Workflow preview.",
    start_url: "/device",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ede9dc",
    theme_color: "#111111",
    icons: [
      {
        src: "/device-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable"
      }
    ]
  });
}

export function buildDeviceIconSvg(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">',
    '<rect width="192" height="192" rx="32" fill="#ede9dc"/>',
    '<rect x="28" y="26" width="136" height="140" rx="14" fill="#fffdf6" stroke="#111" stroke-width="10"/>',
    '<path d="M52 66h88M52 96h88M52 126h56" stroke="#111" stroke-width="10" stroke-linecap="round"/>',
    '<circle cx="138" cy="126" r="13" fill="#111"/>',
    "</svg>"
  ].join("");
}

export function buildDeviceServiceWorker(): string {
  return `
const CACHE_NAME = "towrite-device-shell-v7";
const SHELL_URLS = ["/device", "/device/input", "/device.webmanifest", "/device-icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) {
    return;
  }
  if (event.request.mode === "navigate" || SHELL_URLS.includes(url.pathname)) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request).then((cached) => cached || caches.match("/device")))
    );
  }
});
`;
}
