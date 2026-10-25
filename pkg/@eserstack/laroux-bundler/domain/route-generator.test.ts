// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as routeGenerator from "./route-generator.ts";
import type { ScanResult } from "./route-scanner.ts";

/** One page with its own layout, as the route scanner reports it. */
const SCAN_RESULT: ScanResult = {
  routes: [
    {
      routePath: "/stories",
      componentPath: "src/app/routes/stories/page.tsx",
      layoutPath: "src/app/routes/stories/layout.tsx",
      isApiRoute: false,
    },
  ],
  apiRoutes: [],
  proxies: [],
};

/** Generate the routes file of SCAN_RESULT and return its content. */
async function generate(moduleVersion: string | undefined): Promise<string> {
  const projectRoot = await runtime.fs.makeTempDir({ prefix: "laroux-gen-" });
  try {
    const routesDir = runtime.path.join(projectRoot, "src/app/routes/stories");
    await runtime.fs.ensureDir(routesDir);
    await runtime.fs.writeTextFile(
      runtime.path.join(routesDir, "page.tsx"),
      "export function StoriesPage() {}\n",
    );
    await runtime.fs.writeTextFile(
      runtime.path.join(routesDir, "layout.tsx"),
      "export function StoriesLayout() {}\n",
    );
    const outputPath = runtime.path.join(projectRoot, "_generated-routes.ts");

    await routeGenerator.generateRouteFile({
      scanResult: SCAN_RESULT,
      outputPath,
      projectRoot,
      srcDirName: "src",
      moduleVersion,
    });

    return await runtime.fs.readTextFile(outputPath);
  } finally {
    await runtime.fs.remove(projectRoot, { recursive: true });
  }
}

Deno.test("generateRouteFile imports the page and the layout with the module version", async () => {
  const content = await generate("01J9ABCD");

  assert.assertStringIncludes(
    content,
    'import { StoriesPage } from "./src/app/routes/stories/page.js?v=01J9ABCD";',
  );
  assert.assertStringIncludes(
    content,
    'import { StoriesLayout } from "./src/app/routes/stories/layout.js?v=01J9ABCD";',
  );
  assert.assertStringIncludes(
    content,
    '{ path: "/stories", component: StoriesPage, layout: StoriesLayout }',
  );
});

Deno.test("generateRouteFile imports the modules without a query when no version is given", async () => {
  const content = await generate(undefined);

  assert.assertStringIncludes(
    content,
    'import { StoriesPage } from "./src/app/routes/stories/page.js";',
  );
  assert.assertEquals(content.includes("?v="), false);
});
