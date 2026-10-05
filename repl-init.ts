// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// The banner and the entry list are what the REPL shows its user on start.
// deno-lint-ignore-file no-console

// Note: These relative paths are designed to be run from the project root
import * as pkg from "./pkg/@eserstack/codebase/package/mod.ts";
import * as di from "./pkg/@eserstack/di/mod.ts";
import * as eserstack from "./pkg/@eserstack/mod.ts";

// Display formatting constants
const COLUMN_WIDTH = 20;
const COLUMNS_PER_ROW = 3;

/**
 * The names this REPL defined on globalThis and the container key each one
 * reads, so a later `vars()` can tell them from built-ins and the session's own
 * values, and two keys with the same name do not share one global.
 */
const exposedKeys = new Map<string, di.ServiceKey>();

/**
 * The global name a container key is exposed under: a string key as it is, a
 * class or function key under its name. Symbol keys and anonymous functions
 * have no name to type, so they get none.
 */
const globalNameOf = (key: di.ServiceKey): string | null => {
  if (typeof key === "string") {
    return key;
  }

  if (typeof key === "function" && key.name !== "") {
    return key.name;
  }

  return null;
};

/**
 * Defines a global that resolves `key` through the container on every read,
 * so lazy entries build on first use and transient ones anew each time, as the
 * container defines them. Returns false when the name belongs to a built-in, a
 * value the session assigned, or another container entry that is still
 * registered; the REPL never overwrites those.
 */
const expose = (name: string, key: di.ServiceKey): boolean => {
  const owner = exposedKeys.get(name);

  if (owner === key) {
    return true;
  }

  if (owner !== undefined) {
    // The name reads another key; take it over only once that key is gone.
    if (di.registry.descriptors.has(owner)) {
      return false;
    }
  } else if (name in globalThis) {
    return false;
  }

  Object.defineProperty(globalThis, name, {
    configurable: true,
    enumerable: true,
    get: () => di.services.get(key),
  });
  exposedKeys.set(name, key);

  return true;
};

const formatColumns = (names: ReadonlyArray<string>): string =>
  `- ${
    names.map((x, i) =>
      `${x.padEnd(COLUMN_WIDTH, " ")}${
        i % COLUMNS_PER_ROW === COLUMNS_PER_ROW - 1 ? "\n" : ""
      }`
    ).join("- ")
  }`;

/**
 * Exposes every container entry that has a free global name and lists them.
 * The REPL calls it once on start; the user calls it again as `vars()` after
 * registering services, which exposes the new ones too.
 */
const vars = (): void => {
  const exposed: string[] = [];
  const unreachable: string[] = [];

  for (const key of di.registry.descriptors.keys()) {
    const name = globalNameOf(key);

    if (name !== null && expose(name, key)) {
      exposed.push(name);
    } else {
      unreachable.push(name ?? String(key));
    }
  }

  console.log(
    "\n%cdependency injection container\n------------------------------",
    "font-weight: bold",
  );
  console.log(formatColumns(exposed));

  if (unreachable.length > 0) {
    console.log(
      `\nnot exposed, no free global name: ${
        unreachable.join(", ")
      }; read them with eserstack.di.services.get(key)`,
    );
  }

  console.log(
    '\nregister more with eserstack.di.registry.set("name", value), then run vars() again\n',
  );
};

const init = async (): Promise<void> => {
  // Load package configuration from current directory
  const packageConfig = await pkg.tryLoad({ baseDir: "." });

  // The REPL's own entries. The packages stay under one `eserstack` namespace
  // instead of one global each, so the list shows the container's services.
  di.registry
    .set("eserstack", eserstack)
    .set("packageConfig", packageConfig);

  (globalThis as Record<string, unknown>)["vars"] = vars;

  console.log(
    `%ceserstack REPL, version ${packageConfig?.version?.value ?? "unknown"}`,
    "color: #00ff00",
  );

  vars();
};

// `deno repl --eval-file` runs this file to populate the session before the
// prompt opens, so the setup has to finish at the top level.
// deno-lint-ignore no-top-level-await
await init();
