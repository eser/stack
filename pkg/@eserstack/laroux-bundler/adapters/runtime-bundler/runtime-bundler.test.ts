// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as fs from "@std/fs"; // symlinks are not available in runtime
import { runtime } from "@eserstack/standards/cross-runtime";
import type { ResolvedBrowserShimsConfig } from "@eserstack/laroux/config";
import * as react from "../react/mod.ts";
import * as rscClientEntry from "../react/rsc-client-entry.ts";
import type { FrameworkPlugin } from "../../domain/framework-plugin.ts";
import * as runtimeBundler from "./runtime-bundler.ts";

// Client code that logs the way server code does, through logger.with(...).
const CHECKOUT_SOURCE = `import * as logging from "@eserstack/logging";

const logger = logging.logger.getLogger(["app", "checkout"]);

export function reportSlowPayment(orderId: string): Promise<unknown> {
  return logger.with({ orderId }).warn("payment took longer than a second");
}
`;

type CheckoutModule = {
  readonly reportSlowPayment: (orderId: string) => Promise<unknown>;
};

/**
 * A framework plugin whose client entry only re-exports the checkout module,
 * so the bundle runs outside a browser.
 */
const checkoutEntryPlugin: FrameworkPlugin = {
  name: "checkout-entry",
  createClientEntry: async (_components, projectRoot, distDir) => {
    const entryPath = runtime.path.join(distDir, "entry.ts");
    const checkoutPath = runtime.path.join(projectRoot, "src/checkout.ts");
    await runtime.fs.writeTextFile(
      entryPath,
      `export { reportSlowPayment } from ${JSON.stringify(checkoutPath)};\n`,
    );
    return entryPath;
  },
};

/** Write a project with the checkout module to a temp directory. */
async function withCheckoutProject(
  fn: (projectRoot: string) => Promise<void>,
): Promise<void> {
  const projectRoot = await runtime.fs.makeTempDir({
    prefix: "laroux-runtime-",
  });

  try {
    const checkoutPath = runtime.path.join(projectRoot, "src/checkout.ts");
    await runtime.fs.ensureDir(runtime.path.dirname(checkoutPath));
    await runtime.fs.writeTextFile(checkoutPath, CHECKOUT_SOURCE);
    await fn(projectRoot);
  } finally {
    await runtime.fs.remove(projectRoot, { recursive: true });
  }
}

/** Import bundled code as a module, the way the browser runs it. */
async function importBundle(code: string): Promise<CheckoutModule> {
  return await import(
    `data:text/javascript,${encodeURIComponent(code)}`
  ) as CheckoutModule;
}

/** Run fn with console.warn replaced by a recorder, and return its calls. */
async function recordWarnings(
  fn: () => Promise<unknown>,
): Promise<readonly unknown[][]> {
  const calls: unknown[][] = [];
  const original = globalThis.console.warn;
  globalThis.console.warn = (...args: unknown[]) => {
    calls.push(args);
  };

  try {
    await fn();
  } finally {
    globalThis.console.warn = original;
  }

  return calls;
}

Deno.test("RuntimeBundler gives client code the default browser logger", async () => {
  await withCheckoutProject(async (projectRoot) => {
    const devBundler = new runtimeBundler.RuntimeBundler({
      srcDir: runtime.path.join(projectRoot, "src"),
      projectRoot,
      plugin: checkoutEntryPlugin,
    });

    const bundle = await devBundler.getBundle();
    assert.assertNotEquals(bundle.chunkManifest.buildId, "runtime-error");
    assert.assertExists(bundle.clientCode);

    const checkout = await importBundle(bundle.clientCode);
    const warnings = await recordWarnings(() =>
      checkout.reportSlowPayment("order-1")
    );

    assert.assertEquals(warnings, [
      ["[app.checkout] payment took longer than a second", {
        orderId: "order-1",
      }],
    ]);
  });
});

Deno.test("RuntimeBundler applies the browser shims it is given", async () => {
  await withCheckoutProject(async (projectRoot) => {
    const browserShims: ResolvedBrowserShimsConfig = {
      jsr: {
        "@eserstack/logging": `
const record = (message) => Promise.resolve("custom shim: " + message);
export const logger = {
  getLogger: () => ({ with: () => ({ warn: record }) }),
};
`,
      },
      nodeBuiltins: {},
    };
    const devBundler = new runtimeBundler.RuntimeBundler({
      srcDir: runtime.path.join(projectRoot, "src"),
      projectRoot,
      plugin: checkoutEntryPlugin,
      browserShims,
    });

    const bundle = await devBundler.getBundle();
    assert.assertExists(bundle.clientCode);
    const checkout = await importBundle(bundle.clientCode);

    assert.assertEquals(
      await checkout.reportSlowPayment("order-2"),
      "custom shim: payment took longer than a second",
    );
  });
});

Deno.test("RuntimeBundler keeps the native logger out of a React app's bundle", async () => {
  await withCheckoutProject(async (projectRoot) => {
    // The copied bootstrap imports these by bare specifier; link them from
    // laroux-react's own dependencies, as an installed app has them.
    const bootstrapIndex = rscClientEntry.fileUrlToPath(
      import.meta.resolve("@eserstack/laroux-react/client/bootstrap"),
    );
    const sourceModules = runtime.path.resolve(
      bootstrapIndex,
      "../../../node_modules",
    );
    await Promise.all(
      ["react", "react-dom", "@eserstack/laroux"].map((name) =>
        fs.ensureSymlink(
          runtime.path.join(sourceModules, name),
          runtime.path.join(projectRoot, "node_modules", name),
        )
      ),
    );

    const devBundler = new runtimeBundler.RuntimeBundler({
      srcDir: runtime.path.join(projectRoot, "src"),
      projectRoot,
      plugin: react.reactPlugin,
    });

    const bundle = await devBundler.getBundle();
    assert.assertNotEquals(bundle.chunkManifest.buildId, "runtime-error");
    assert.assertExists(bundle.clientCode);

    // The bootstrap logs through @eserstack/logging. Its browser shim reports
    // its own faults with this message; the package itself would bring the
    // native bridge's symbols into the bundle.
    assert.assertStringIncludes(
      bundle.clientCode,
      "[eserstack/logging] writing a log record failed",
    );
    assert.assertEquals(bundle.clientCode.includes("EserAjanLogCreate"), false);
  });
});
