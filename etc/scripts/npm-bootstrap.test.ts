// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as bootstrap from "./npm-bootstrap.ts";

nodeTest.test("parseOptions: no arguments lists every missing name", () => {
  assert.assertEquals(bootstrap.parseOptions([]), {
    publish: false,
    otp: null,
    names: [],
  });
});

nodeTest.test("parseOptions: --publish, --otp and names", () => {
  assert.assertEquals(
    bootstrap.parseOptions([
      "--publish",
      "--otp=123456",
      "@eserstack/eser-darwin-arm64",
    ]),
    { publish: true, otp: "123456", names: ["@eserstack/eser-darwin-arm64"] },
  );
  assert.assertEquals(
    bootstrap.parseOptions(["--otp", "654321"]).otp,
    "654321",
  );
});

nodeTest.test("parseOptions: refuses an unknown flag and an empty otp", () => {
  assert.assertThrows(
    () => bootstrap.parseOptions(["--force"]),
    Error,
    "--force",
  );
  assert.assertThrows(() => bootstrap.parseOptions(["--otp"]), Error, "--otp");
  assert.assertThrows(() => bootstrap.parseOptions(["--otp="]), Error, "--otp");
});

nodeTest.test(
  "publishableNames: the names of the packages that are not private",
  () => {
    assert.assertEquals(
      bootstrap.publishableNames([
        { name: "@eserstack/b" },
        { name: "@eserstack/test-kit", private: true },
        { name: "eser" },
        {},
        { name: "@eserstack/a" },
      ]),
      ["@eserstack/a", "@eserstack/b", "eser"],
    );
  },
);

nodeTest.test(
  "selectTargets: the named packages, which must be publishable",
  () => {
    const publishable = ["@eserstack/a", "@eserstack/b"];

    assert.assertEquals(bootstrap.selectTargets(publishable, []), publishable);
    assert.assertEquals(
      bootstrap.selectTargets(publishable, ["@eserstack/b"]),
      ["@eserstack/b"],
    );
    assert.assertThrows(
      () => bootstrap.selectTargets(publishable, ["@eserstack/test-kit"]),
      Error,
      "@eserstack/test-kit",
    );
  },
);

nodeTest.test(
  "viewState: published, missing on E404, an error otherwise",
  () => {
    assert.assertEquals(
      bootstrap.viewState("eser", { success: true, output: "5.0.0\n" }),
      "published",
    );
    assert.assertEquals(
      bootstrap.viewState("@eserstack/eser-linux-x64", {
        success: false,
        output: "npm error code E404\nnpm error 404 Not Found",
      }),
      "missing",
    );
    // A network failure must not read as a free name.
    assert.assertThrows(
      () =>
        bootstrap.viewState("eser", {
          success: false,
          output: "npm error code ETIMEDOUT",
        }),
      Error,
      "ETIMEDOUT",
    );
  },
);

nodeTest.test(
  "placeholderManifest: a prerelease that takes no release version",
  () => {
    const manifest = bootstrap.placeholderManifest("@eserstack/eser-linux-x64");

    assert.assertEquals(manifest.name, "@eserstack/eser-linux-x64");
    assert.assertEquals(manifest.version, "0.0.0-bootstrap.0");
    assert.assertEquals(manifest.license, "Apache-2.0");
    assert.assertEquals(manifest.repository, {
      type: "git",
      url: "git+https://github.com/eser/stack.git",
    });
  },
);

nodeTest.test("placeholderDir: one directory per name under etc/temp", () => {
  assert.assertEquals(
    bootstrap.placeholderDir("@eserstack/eser-win32-x64"),
    "etc/temp/npm-bootstrap/eserstack-eser-win32-x64",
  );
  assert.assertEquals(
    bootstrap.placeholderDir("eser"),
    "etc/temp/npm-bootstrap/eser",
  );
});

nodeTest.test(
  "publishArgs: public, under the bootstrap tag, with the otp",
  () => {
    assert.assertEquals(bootstrap.publishArgs(null), [
      "publish",
      "--access",
      "public",
      "--tag",
      "bootstrap",
    ]);
    assert.assertEquals(bootstrap.publishArgs("123456").at(-1), "--otp=123456");
  },
);

nodeTest.test(
  "nextSteps: the trusted publisher page and the tidy-up of each name",
  () => {
    const steps = bootstrap.nextSteps(["@eserstack/eser-linux-x64"]);

    assert.assertStringIncludes(
      steps,
      "https://www.npmjs.com/package/@eserstack/eser-linux-x64/access",
    );
    assert.assertStringIncludes(steps, "build.yml");
    assert.assertStringIncludes(
      steps,
      "npm dist-tag rm @eserstack/eser-linux-x64 bootstrap",
    );
    assert.assertStringIncludes(
      steps,
      'npm deprecate @eserstack/eser-linux-x64@0.0.0-bootstrap.0 "placeholder"',
    );
  },
);
