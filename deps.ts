/// <reference lib="deno.ns" />

if (globalThis.Deno === undefined) {
  throw new Error("Deno is not defined");
}

export const deno = globalThis.Deno;
