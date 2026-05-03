// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  hasVariables,
  isBinaryFile,
  shouldIgnore,
  substituteInPath,
  substituteVariables,
} from "./processor.ts";

// =============================================================================
// isBinaryFile
// =============================================================================

describe("isBinaryFile", () => {
  it("returns true for image extensions", () => {
    assertEquals(isBinaryFile("image.png"), true);
    assertEquals(isBinaryFile("photo.jpg"), true);
    assertEquals(isBinaryFile("icon.gif"), true);
  });

  it("returns true for font extensions", () => {
    assertEquals(isBinaryFile("font.woff"), true);
    assertEquals(isBinaryFile("font.woff2"), true);
  });

  it("returns true for archive extensions", () => {
    assertEquals(isBinaryFile("archive.zip"), true);
    assertEquals(isBinaryFile("bundle.tar"), true);
  });

  it("returns true for .zip", () => {
    assertEquals(isBinaryFile("release.zip"), true);
  });

  it("returns false for text extensions", () => {
    assertEquals(isBinaryFile("main.ts"), false);
    assertEquals(isBinaryFile("config.json"), false);
    assertEquals(isBinaryFile("README.md"), false);
  });

  it("returns false for file with no extension", () => {
    assertEquals(isBinaryFile("Makefile"), false);
    assertEquals(isBinaryFile("LICENSE"), false);
  });

  it("is case-insensitive via filepath.toLowerCase()", () => {
    // isBinaryFile lowercases the path before checking extension
    assertEquals(isBinaryFile("IMAGE.PNG"), true);
    assertEquals(isBinaryFile("font.WOFF2"), true);
  });
});

// =============================================================================
// shouldIgnore
// =============================================================================

describe("shouldIgnore", () => {
  it("returns false for empty ignore list", () => {
    assertEquals(shouldIgnore("LICENSE", []), false);
    assertEquals(shouldIgnore("src/index.ts", []), false);
  });

  it("matches top-level file via **/foo globstar pattern", () => {
    assertEquals(shouldIgnore("foo", ["**/foo"]), true);
  });

  it("matches nested file via **/foo globstar pattern", () => {
    assertEquals(shouldIgnore("a/b/foo", ["**/foo"]), true);
  });

  it("matches top-level test file via **/*.test.ts", () => {
    assertEquals(shouldIgnore("x.test.ts", ["**/*.test.ts"]), true);
  });

  it("matches nested test file via **/*.test.ts", () => {
    assertEquals(shouldIgnore("a/b/x.test.ts", ["**/*.test.ts"]), true);
  });

  it("matches markdown files via *.md", () => {
    assertEquals(shouldIgnore("README.md", ["*.md"]), true);
  });

  it("does not match unrelated extension", () => {
    assertEquals(shouldIgnore("unrelated.ts", ["*.md"]), false);
  });

  it("matches file under directory pattern via dir/ prefix", () => {
    assertEquals(shouldIgnore("src/foo.ts", ["src/"]), true);
  });

  it("matches file under bare directory name", () => {
    assertEquals(shouldIgnore("src/foo.ts", ["src"]), true);
  });

  it("does not match sibling file to a directory pattern", () => {
    assertEquals(shouldIgnore("srcfile.ts", ["src/"]), false);
  });
});

// =============================================================================
// substituteInPath
// =============================================================================

describe("substituteInPath", () => {
  it("substitutes a variable in a path segment", () => {
    assertEquals(
      substituteInPath("templates/{{.name}}/index.ts", { name: "foo" }),
      "templates/foo/index.ts",
    );
  });

  it("substitutes multiple variables across segments", () => {
    assertEquals(
      substituteInPath("{{.prefix}}/{{.name}}/file.ts", {
        prefix: "my",
        name: "app",
      }),
      "my/app/file.ts",
    );
  });

  it("substitutes multiple variables within a single segment", () => {
    assertEquals(
      substituteInPath("{{.prefix}}-{{.name}}", { prefix: "my", name: "app" }),
      "my-app",
    );
  });

  it("leaves missing variables as-is (passes through)", () => {
    assertEquals(
      substituteInPath("{{.missing}}/file.ts", {}),
      "{{.missing}}/file.ts",
    );
  });

  it("returns path unchanged when no placeholders exist", () => {
    assertEquals(
      substituteInPath("src/utils/helper.ts", { name: "ignored" }),
      "src/utils/helper.ts",
    );
  });
});

// =============================================================================
// substituteVariables
// =============================================================================

describe("substituteVariables", () => {
  it("replaces a single placeholder", () => {
    assertEquals(
      substituteVariables("Hello {{.name}}!", { name: "world" }),
      "Hello world!",
    );
  });

  it("replaces multiple different placeholders", () => {
    assertEquals(
      substituteVariables("{{.a}} and {{.b}}", { a: "foo", b: "bar" }),
      "foo and bar",
    );
  });

  it("replaces repeated placeholder", () => {
    assertEquals(
      substituteVariables("{{.x}} + {{.x}}", { x: "42" }),
      "42 + 42",
    );
  });

  it("keeps unresolved placeholder as-is", () => {
    assertEquals(substituteVariables("{{.notfound}}", {}), "{{.notfound}}");
  });

  it("handles whitespace inside placeholder", () => {
    assertEquals(
      substituteVariables("{{ .name }}", { name: "world" }),
      "world",
    );
  });

  it("returns content unchanged when no placeholders exist", () => {
    const content = "plain text";
    assertEquals(substituteVariables(content, { x: "ignored" }), content);
  });
});

// =============================================================================
// hasVariables
// =============================================================================

describe("hasVariables", () => {
  it("returns true when placeholder is present", () => {
    assertEquals(hasVariables("{{.name}}"), true);
    assertEquals(hasVariables("hello {{ .x }} world"), true);
  });

  it("returns false for plain text", () => {
    assertEquals(hasVariables("no placeholders here"), false);
  });

  it("returns false for non-variable braces", () => {
    assertEquals(hasVariables("{{ not a var }}"), false);
    assertEquals(hasVariables("{{noperiod}}"), false);
  });
});
