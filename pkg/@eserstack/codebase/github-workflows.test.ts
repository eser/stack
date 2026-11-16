// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";

// Every path is built from this file's directory, so the tests do not depend
// on the working directory the suite runs from.
const testDir = import.meta.dirname;
if (testDir === undefined) {
  throw new Error(
    "github-workflows.test.ts must run from a local file: it reads the " +
      "workflows relative to its own directory.",
  );
}

const workflowsDir = runtime.path.resolve(
  testDir,
  "../../../.github/workflows",
);

// A step that reads a version pin from the workspace: pnpm/action-setup
// without `version` reads packageManager from package.json, and
// `node-version-file` reads .node-version.
const readsVersionPin = (step: string): boolean =>
  (/uses:\s*pnpm\/action-setup@/.test(step) && !/\n\s+version:/.test(step)) ||
  /node-version-file:/.test(step);

const jobsOf = (workflow: string): Array<{ name: string; body: string }> => {
  const jobsStart = workflow.search(/^jobs:\n/m);
  if (jobsStart === -1) {
    return [];
  }

  const parts = workflow.slice(jobsStart).split(/^ {2}(?=[a-z0-9_-]+:\n)/m);

  return parts
    .slice(1)
    .map((body) => ({ name: body.slice(0, body.indexOf(":")), body }));
};

// A job that sets up pnpm or Node from the version pins needs them in its
// workspace. The tag-only jobs that install a downloaded artifact skipped the
// checkout, so the v5.0.0 run stopped in setup before anything was published.
nodeTest.test(
  "every job that reads a version pin checks out first",
  async () => {
    const files = (await Array.fromAsync(runtime.fs.readDir(workflowsDir)))
      .map((entry) => entry.name)
      .filter((name) => name.endsWith(".yml"));

    assert.assert(files.length > 0, "no workflows found");

    const missing: string[] = [];

    const workflows = await Promise.all(
      files.map(async (file) => ({
        file,
        workflow: await runtime.fs.readTextFile(
          runtime.path.join(workflowsDir, file),
        ),
      })),
    );

    for (const { file, workflow } of workflows) {
      for (const job of jobsOf(workflow)) {
        const steps = job.body.split(/^ {6}- /m).slice(1);
        const firstPin = steps.findIndex(readsVersionPin);
        if (firstPin === -1) {
          continue;
        }

        const checkout = steps.findIndex((step) =>
          /uses:\s*actions\/checkout@/.test(step),
        );
        if (checkout === -1 || checkout > firstPin) {
          missing.push(`${file}: ${job.name}`);
        }
      }
    }

    assert.assertEquals(missing, []);
  },
);
