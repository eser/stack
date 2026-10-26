// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Registers the service worker. Kept out of the page so the CSP needs no
// inline scripts. A page served over HTTPS (the noskills-server daemon) also
// hands the worker the server's certificate fingerprint from
// /api/cert-fingerprint, which WebTransport pins. A plain-HTTP page (the
// local `noskills web` dashboard) has no certificate to pin, and its server
// has no such route.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js")
    .then((reg) => {
      if (location.protocol !== "https:") return;
      fetch("/api/cert-fingerprint")
        .then((r) => r.json())
        .then((d) => {
          if (
            typeof d.fingerprint === "string" &&
            d.fingerprint !== "" &&
            reg.active !== null
          ) {
            reg.active.postMessage({
              type: "store_cert_fingerprint",
              fingerprint: d.fingerprint,
            });
          }
        })
        .catch(() => {});
    })
    .catch(() => {});
}
