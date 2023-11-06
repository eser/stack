// Copyright 2023 the cool authors. All rights reserved. MIT license.

// Polyfill for old safari versions
if (typeof globalThis === "undefined") {
  // @ts-ignore polyfill
  window.globalThis = window;
}
