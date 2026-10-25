// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as bdd from "@std/testing/bdd";
import * as processor from "./processor.ts";

// =============================================================================
// isBinaryFile
// =============================================================================

bdd.describe("isBinaryFile", () => {
  bdd.it("returns true for image extensions", () => {
    assert.assertEquals(processor.isBinaryFile("image.png"), true);
    assert.assertEquals(processor.isBinaryFile("photo.jpg"), true);
    assert.assertEquals(processor.isBinaryFile("icon.gif"), true);
  });

  bdd.it("returns true for font extensions", () => {
    assert.assertEquals(processor.isBinaryFile("font.woff"), true);
    assert.assertEquals(processor.isBinaryFile("font.woff2"), true);
  });

  bdd.it("returns true for archive extensions", () => {
    assert.assertEquals(processor.isBinaryFile("archive.zip"), true);
    assert.assertEquals(processor.isBinaryFile("bundle.tar"), true);
  });

  bdd.it("returns true for .zip", () => {
    assert.assertEquals(processor.isBinaryFile("release.zip"), true);
  });

  bdd.it("returns false for text extensions", () => {
    assert.assertEquals(processor.isBinaryFile("main.ts"), false);
    assert.assertEquals(processor.isBinaryFile("config.json"), false);
    assert.assertEquals(processor.isBinaryFile("README.md"), false);
  });

  bdd.it("returns false for file with no extension", () => {
    assert.assertEquals(processor.isBinaryFile("Makefile"), false);
    assert.assertEquals(processor.isBinaryFile("LICENSE"), false);
  });

  bdd.it("is case-insensitive via filepath.toLowerCase()", () => {
    // isBinaryFile lowercases the path before checking extension
    assert.assertEquals(processor.isBinaryFile("IMAGE.PNG"), true);
    assert.assertEquals(processor.isBinaryFile("font.WOFF2"), true);
  });
});

// =============================================================================
// shouldIgnore
// =============================================================================

bdd.describe("shouldIgnore", () => {
  bdd.it("returns false for empty ignore list", () => {
    assert.assertEquals(processor.shouldIgnore("LICENSE", []), false);
    assert.assertEquals(processor.shouldIgnore("src/index.ts", []), false);
  });

  bdd.it("matches top-level file via **/foo globstar pattern", () => {
    assert.assertEquals(processor.shouldIgnore("foo", ["**/foo"]), true);
  });

  bdd.it("matches nested file via **/foo globstar pattern", () => {
    assert.assertEquals(processor.shouldIgnore("a/b/foo", ["**/foo"]), true);
  });

  bdd.it("matches top-level test file via **/*.test.ts", () => {
    assert.assertEquals(
      processor.shouldIgnore("x.test.ts", ["**/*.test.ts"]),
      true,
    );
  });

  bdd.it("matches nested test file via **/*.test.ts", () => {
    assert.assertEquals(
      processor.shouldIgnore("a/b/x.test.ts", ["**/*.test.ts"]),
      true,
    );
  });

  bdd.it("matches markdown files via *.md", () => {
    assert.assertEquals(processor.shouldIgnore("README.md", ["*.md"]), true);
  });

  bdd.it("does not match unrelated extension", () => {
    assert.assertEquals(
      processor.shouldIgnore("unrelated.ts", ["*.md"]),
      false,
    );
  });

  bdd.it("matches file under directory pattern via dir/ prefix", () => {
    assert.assertEquals(processor.shouldIgnore("src/foo.ts", ["src/"]), true);
  });

  bdd.it("matches file under bare directory name", () => {
    assert.assertEquals(processor.shouldIgnore("src/foo.ts", ["src"]), true);
  });

  bdd.it("does not match sibling file to a directory pattern", () => {
    assert.assertEquals(processor.shouldIgnore("srcfile.ts", ["src/"]), false);
  });
});

// =============================================================================
// substituteInPath
// =============================================================================

bdd.describe("substituteInPath", () => {
  bdd.it("substitutes a variable in a path segment", () => {
    assert.assertEquals(
      processor.substituteInPath("templates/{{.name}}/index.ts", {
        name: "foo",
      }),
      "templates/foo/index.ts",
    );
  });

  bdd.it("substitutes multiple variables across segments", () => {
    assert.assertEquals(
      processor.substituteInPath("{{.prefix}}/{{.name}}/file.ts", {
        prefix: "my",
        name: "app",
      }),
      "my/app/file.ts",
    );
  });

  bdd.it("substitutes multiple variables within a single segment", () => {
    assert.assertEquals(
      processor.substituteInPath("{{.prefix}}-{{.name}}", {
        prefix: "my",
        name: "app",
      }),
      "my-app",
    );
  });

  bdd.it("leaves missing variables as-is (passes through)", () => {
    assert.assertEquals(
      processor.substituteInPath("{{.missing}}/file.ts", {}),
      "{{.missing}}/file.ts",
    );
  });

  bdd.it("returns path unchanged when no placeholders exist", () => {
    assert.assertEquals(
      processor.substituteInPath("src/utils/helper.ts", { name: "ignored" }),
      "src/utils/helper.ts",
    );
  });
});

// =============================================================================
// substituteVariables
// =============================================================================

bdd.describe("substituteVariables", () => {
  bdd.it("replaces a single placeholder", () => {
    assert.assertEquals(
      processor.substituteVariables("Hello {{.name}}!", { name: "world" }),
      "Hello world!",
    );
  });

  bdd.it("replaces multiple different placeholders", () => {
    assert.assertEquals(
      processor.substituteVariables("{{.a}} and {{.b}}", {
        a: "foo",
        b: "bar",
      }),
      "foo and bar",
    );
  });

  bdd.it("replaces repeated placeholder", () => {
    assert.assertEquals(
      processor.substituteVariables("{{.x}} + {{.x}}", { x: "42" }),
      "42 + 42",
    );
  });

  bdd.it("keeps unresolved placeholder as-is", () => {
    assert.assertEquals(
      processor.substituteVariables("{{.notfound}}", {}),
      "{{.notfound}}",
    );
  });

  bdd.it("handles whitespace inside placeholder", () => {
    assert.assertEquals(
      processor.substituteVariables("{{ .name }}", { name: "world" }),
      "world",
    );
  });

  bdd.it("returns content unchanged when no placeholders exist", () => {
    const content = "plain text";
    assert.assertEquals(
      processor.substituteVariables(content, { x: "ignored" }),
      content,
    );
  });
});

// =============================================================================
// hasVariables
// =============================================================================

bdd.describe("hasVariables", () => {
  bdd.it("returns true when placeholder is present", () => {
    assert.assertEquals(processor.hasVariables("{{.name}}"), true);
    assert.assertEquals(processor.hasVariables("hello {{ .x }} world"), true);
  });

  bdd.it("returns false for plain text", () => {
    assert.assertEquals(processor.hasVariables("no placeholders here"), false);
  });

  bdd.it("returns false for non-variable braces", () => {
    assert.assertEquals(processor.hasVariables("{{ not a var }}"), false);
    assert.assertEquals(processor.hasVariables("{{noperiod}}"), false);
  });
});
