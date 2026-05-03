// noskills-server service worker
// Handles Web Push notifications and notificationclick → PWA focus.
// Served at /sw.js (root scope) by the daemon's HTTP/3 server.

const SW_VERSION = "1";

// ── Install & activate ────────────────────────────────────────────────────────

self.addEventListener("install", (event) => {
  // Activate immediately — no waiting for existing tabs to close.
  // This ensures cert fingerprint refreshes reach the SW promptly.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// ── Push event ────────────────────────────────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { kind: "unknown", summary: event.data.text() };
  }

  const title = "noskills";
  const kind = payload.kind ?? "notification";
  const body = payload.summary ?? "Activity in your session";
  const sessionId = payload.sessionId ?? "";
  const tag = sessionId ? `${sessionId}:${kind}` : kind;

  const options = {
    body,
    tag,               // collapses duplicate notifications for same session+kind
    renotify: false,   // don't vibrate if same tag is already shown
    requireInteraction: kind === "permission_request", // stay visible for permission requests
    data: { sessionId, projectSlug: payload.projectSlug ?? "", kind, url: "/" },
    icon: "/static/icons/icon.svg",
    badge: "/static/icons/icon.svg",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Notification click ────────────────────────────────────────────────────────

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const { url, sessionId } = event.notification.data ?? {};
  const targetUrl = sessionId ? `/?session=${sessionId}` : (url ?? "/");

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Focus an existing PWA window if one is open.
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // Otherwise open a new window.
        if (self.clients.openWindow) {
          return self.clients.openWindow(targetUrl);
        }
      }),
  );
});

// ── Cert fingerprint storage ──────────────────────────────────────────────────
// Stores the daemon's TLS fingerprint so WebTransport clients can use
// serverCertificateHashes without relying on OS CA trust (required for iOS PWA).

const DB_NAME = "noskills-cert";
const DB_STORE = "fingerprints";

function openCertDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// storeCertFingerprint is called by the main page after fetching /api/cert-fingerprint.
// Exposed as a message handler so the page can update the stored fingerprint.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "store_cert_fingerprint") return;

  const { fingerprint } = event.data;
  if (!fingerprint) return;

  openCertDB().then((db) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(fingerprint, "active");
  }).catch(() => {});
});
