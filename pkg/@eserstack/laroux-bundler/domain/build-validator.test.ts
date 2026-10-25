// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as buildValidator from "./build-validator.ts";

/**
 * Creates a project whose src/ holds one file written after `buildStartTime`,
 * the way a build that leaks output into src/ would leave it.
 */
async function withLeakyProject(
  fn: (projectRoot: string, buildStartTime: Date) => Promise<void>,
): Promise<void> {
  const projectRoot = await runtime.fs.makeTempDir({
    prefix: "laroux-isolation-",
  });
  const buildStartTime = new Date(Date.now() - 60_000);

  try {
    await runtime.fs.mkdir(runtime.path.join(projectRoot, "src"), {
      recursive: true,
    });
    await runtime.fs.writeTextFile(
      runtime.path.join(projectRoot, "src", "leak.ts"),
      "export {};\n",
    );

    await fn(projectRoot, buildStartTime);
  } finally {
    await runtime.fs.remove(projectRoot, { recursive: true });
  }
}

Deno.test(
  // The scan walks through the native library, which stays open for the rest
  // of the process once loaded.
  { name: "build-validator", sanitizeResources: false },
  async (t) => {
    await t.step(
      "validateBuildIsolation throws BuildIsolationError in strict mode",
      async () => {
        await withLeakyProject(async (projectRoot, buildStartTime) => {
          const error = await assert.assertRejects(
            () =>
              buildValidator.validateBuildIsolation(
                projectRoot,
                "dist",
                buildStartTime,
                { strict: true },
              ),
            buildValidator.BuildIsolationError,
          );

          assert.assertEquals(
            error.violations.map((violation) => violation.relativePath),
            [runtime.path.join("src", "leak.ts")],
          );
          assert.assertStringIncludes(error.message, "leak.ts (modified)");
        });
      },
    );

    await t.step(
      "validateBuildIsolation reports violations without strict mode",
      async () => {
        await withLeakyProject(async (projectRoot, buildStartTime) => {
          const report = await buildValidator.validateBuildIsolation(
            projectRoot,
            "dist",
            buildStartTime,
          );

          assert.assertEquals(report.valid, false);
          assert.assertEquals(
            report.violations.map((violation) => violation.relativePath),
            [runtime.path.join("src", "leak.ts")],
          );
        });
      },
    );

    await t.step(
      "validateBuildIsolation reports strict warnOnly violations without throwing",
      async () => {
        await withLeakyProject(async (projectRoot, buildStartTime) => {
          const report = await buildValidator.validateBuildIsolation(
            projectRoot,
            "dist",
            buildStartTime,
            { strict: true, warnOnly: true },
          );

          assert.assertEquals(report.valid, false);
          assert.assertEquals(report.violations.length, 1);
        });
      },
    );

    await t.step(
      "validateBuildIsolation passes when nothing changed after the build start",
      async () => {
        await withLeakyProject(async (projectRoot) => {
          const report = await buildValidator.validateBuildIsolation(
            projectRoot,
            "dist",
            new Date(Date.now() + 60_000),
            { strict: true },
          );

          assert.assertEquals(report.valid, true);
          assert.assertEquals(report.violations, []);
        });
      },
    );
  },
);
