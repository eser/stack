// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as install from "./install.ts";

nodeTest.test("parseInstallArgs reads the long flags", () => {
  assert.assertEquals(
    install.parseInstallArgs(["--force", "--dry-run", "--help"]),
    { help: true, force: true, dryRun: true },
  );
});

nodeTest.test("parseInstallArgs reads the -f, -n and -h aliases", () => {
  assert.assertEquals(install.parseInstallArgs(["-f", "-n"]), {
    help: false,
    force: true,
    dryRun: true,
  });
  assert.assertEquals(install.parseInstallArgs(["-h"]).help, true);
});

nodeTest.test("parseInstallArgs defaults every flag to false", () => {
  assert.assertEquals(install.parseInstallArgs(), {
    help: false,
    force: false,
    dryRun: false,
  });
});

nodeTest.test(
  "parseHelpArgs reads --help and -h for uninstall and status",
  () => {
    assert.assertEquals(install.parseHelpArgs(["--help"]), { help: true });
    assert.assertEquals(install.parseHelpArgs(["-h"]), { help: true });
    assert.assertEquals(install.parseHelpArgs([]), { help: false });
  },
);
