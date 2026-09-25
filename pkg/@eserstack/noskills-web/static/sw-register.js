// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Registers the service worker and hands it the server's certificate
// fingerprint. Kept out of the page so the CSP needs no inline scripts.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then((reg) => {
    fetch("/api/cert-fingerprint")
      .then((r) => r.json())
      .then((d) => {
        if (d.fingerprint && reg.active) {
          reg.active.postMessage({
            type: "store_cert_fingerprint",
            fingerprint: d.fingerprint,
          });
        }
      })
      .catch(() => {});
  }).catch(() => {});
}
