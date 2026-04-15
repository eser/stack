// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as registrySchema from "./registry-schema.ts";

// =============================================================================
// validateRegistryManifest
// =============================================================================

const VALID_MINIMAL: Record<string, unknown> = {
  name: "test",
  description: "Test registry",
  author: "Test Author",
  registryUrl: "https://example.com/registry",
  recipes: [],
};

const VALID_RECIPE: Record<string, unknown> = {
  name: "my-recipe",
  description: "A test recipe",
  language: "typescript",
  scale: "utility",
  files: [{ source: "src/foo.ts", target: "lib/foo.ts" }],
};

Deno.test("validateRegistryManifest — valid minimal manifest", () => {
  const result = registrySchema.validateRegistryManifest(VALID_MINIMAL);

  assert.assertEquals(result.name, "test");
  assert.assertEquals(result.recipes.length, 0);
});

Deno.test("validateRegistryManifest — valid manifest with recipes", () => {
  const manifest = {
    ...VALID_MINIMAL,
    recipes: [VALID_RECIPE],
  };

  const result = registrySchema.validateRegistryManifest(manifest);

  assert.assertEquals(result.recipes.length, 1);
  assert.assertEquals(result.recipes[0]!.name, "my-recipe");
});

Deno.test("validateRegistryManifest — optional fields default correctly", () => {
  const manifest = {
    ...VALID_MINIMAL,
    recipes: [VALID_RECIPE],
  };

  const result = registrySchema.validateRegistryManifest(manifest);
  const recipe = result.recipes[0]!;

  assert.assertEquals(recipe.tags, undefined);
  assert.assertEquals(recipe.dependencies, undefined);
  assert.assertEquals(recipe.transforms, undefined);
});

Deno.test("validateRegistryManifest — all scale values accepted", () => {
  for (const scale of ["project", "structure", "utility"]) {
    const manifest = {
      ...VALID_MINIMAL,
      recipes: [{ ...VALID_RECIPE, scale }],
    };

    const result = registrySchema.validateRegistryManifest(manifest);

    assert.assertEquals(result.recipes[0]!.scale, scale);
  }
});

Deno.test("validateRegistryManifest — rejects non-object", () => {
  assert.assertThrows(
    () => registrySchema.validateRegistryManifest("not an object"),
    Error,
    "must be a JSON object",
  );
});

Deno.test("validateRegistryManifest — rejects null", () => {
  assert.assertThrows(
    () => registrySchema.validateRegistryManifest(null),
    Error,
    "must be a JSON object",
  );
});

Deno.test("validateRegistryManifest — rejects missing name", () => {
  const manifest = { ...VALID_MINIMAL };
  delete manifest["name"];

  assert.assertThrows(
    () => registrySchema.validateRegistryManifest(manifest),
    Error,
    "'name'",
  );
});

Deno.test("validateRegistryManifest — rejects missing description", () => {
  const manifest = { ...VALID_MINIMAL };
  delete manifest["description"];

  assert.assertThrows(
    () => registrySchema.validateRegistryManifest(manifest),
    Error,
    "'description'",
  );
});

Deno.test("validateRegistryManifest — rejects missing registryUrl", () => {
  const manifest = { ...VALID_MINIMAL };
  delete manifest["registryUrl"];

  assert.assertThrows(
    () => registrySchema.validateRegistryManifest(manifest),
    Error,
    "'registryUrl'",
  );
});

Deno.test("validateRegistryManifest — rejects wrong type for recipes", () => {
  const manifest = { ...VALID_MINIMAL, recipes: "not an array" };

  assert.assertThrows(
    () => registrySchema.validateRegistryManifest(manifest),
    Error,
    "'recipes' array",
  );
});

Deno.test("validateRegistryManifest — warns on unknown schema version", () => {
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (msg: string) => warnings.push(msg);

  try {
    registrySchema.validateRegistryManifest({
      ...VALID_MINIMAL,
      $schema: "https://example.com/registry/v99.json",
    });

    assert.assertEquals(warnings.length, 1);
    assert.assertStringIncludes(warnings[0]!, "unknown schema");
  } finally {
    console.warn = origWarn;
  }
});

Deno.test("validateRegistryManifest — accepts known schema version", () => {
  const warnings: string[] = [];
  const origWarn = console.warn;
  console.warn = (msg: string) => warnings.push(msg);

  try {
    registrySchema.validateRegistryManifest({
      ...VALID_MINIMAL,
      $schema: "https://eser.live/registry/v1.json",
    });

    assert.assertEquals(warnings.length, 0);
  } finally {
    console.warn = origWarn;
  }
});

Deno.test("validateRegistryManifest — rejects invalid recipe (missing name)", () => {
  const manifest = {
    ...VALID_MINIMAL,
    recipes: [{
      description: "no name",
      language: "ts",
      scale: "utility",
      files: [{ source: "a", target: "b" }],
    }],
  };

  assert.assertThrows(
    () => registrySchema.validateRegistryManifest(manifest),
    Error,
    "Invalid recipe",
  );
});

Deno.test("validateRegistryManifest — rejects invalid scale", () => {
  const manifest = {
    ...VALID_MINIMAL,
    recipes: [{ ...VALID_RECIPE, scale: "mega" }],
  };

  assert.assertThrows(
    () => registrySchema.validateRegistryManifest(manifest),
    Error,
    "Invalid recipe",
  );
});

Deno.test("validateRegistryManifest — rejects empty files array", () => {
  const manifest = {
    ...VALID_MINIMAL,
    recipes: [{ ...VALID_RECIPE, files: [] }],
  };

  assert.assertThrows(
    () => registrySchema.validateRegistryManifest(manifest),
    Error,
    "Invalid recipe",
  );
});

Deno.test("validateRegistryManifest — rejects invalid file entry", () => {
  const manifest = {
    ...VALID_MINIMAL,
    recipes: [{ ...VALID_RECIPE, files: [{ source: "a" }] }],
  };

  assert.assertThrows(
    () => registrySchema.validateRegistryManifest(manifest),
    Error,
    "Invalid recipe",
  );
});

Deno.test("validateRegistryManifest — rejects duplicate recipe names", () => {
  const manifest = {
    ...VALID_MINIMAL,
    recipes: [VALID_RECIPE, VALID_RECIPE],
  };

  assert.assertThrows(
    () => registrySchema.validateRegistryManifest(manifest),
    Error,
    "Duplicate recipe name",
  );
});

Deno.test("validateRegistryManifest — rejects invalid dependencies type", () => {
  const manifest = {
    ...VALID_MINIMAL,
    recipes: [{ ...VALID_RECIPE, dependencies: { go: "not-array" } }],
  };

  assert.assertThrows(
    () => registrySchema.validateRegistryManifest(manifest),
    Error,
    "Invalid recipe",
  );
});

// =============================================================================
// New fields: requires, variables, postInstall, kind, provider
// =============================================================================

Deno.test("validateRegistryManifest — accepts recipe with requires", () => {
  const manifest = {
    ...VALID_MINIMAL,
    recipes: [{
      ...VALID_RECIPE,
      requires: ["other-recipe"],
    }],
  };

  const result = registrySchema.validateRegistryManifest(manifest);

  assert.assertEquals(result.recipes[0]!.requires, ["other-recipe"]);
});

Deno.test("validateRegistryManifest — rejects non-array requires", () => {
  const manifest = {
    ...VALID_MINIMAL,
    recipes: [{ ...VALID_RECIPE, requires: "not-array" }],
  };

  assert.assertThrows(
    () => registrySchema.validateRegistryManifest(manifest),
    Error,
    "Invalid recipe",
  );
});

Deno.test("validateRegistryManifest — rejects non-string requires entry", () => {
  const manifest = {
    ...VALID_MINIMAL,
    recipes: [{ ...VALID_RECIPE, requires: [123] }],
  };

  assert.assertThrows(
    () => registrySchema.validateRegistryManifest(manifest),
    Error,
    "Invalid recipe",
  );
});

Deno.test("validateRegistryManifest — accepts recipe with variables", () => {
  const manifest = {
    ...VALID_MINIMAL,
    recipes: [{
      ...VALID_RECIPE,
      variables: [
        {
          name: "project_name",
          description: "Project name",
          default: "my-app",
        },
        { name: "author", description: "Author name", prompt: "Who are you?" },
      ],
    }],
  };

  const result = registrySchema.validateRegistryManifest(manifest);
  const vars = result.recipes[0]!.variables!;

  assert.assertEquals(vars.length, 2);
  assert.assertEquals(vars[0]!.name, "project_name");
  assert.assertEquals(vars[0]!.default, "my-app");
  assert.assertEquals(vars[1]!.prompt, "Who are you?");
});

Deno.test("validateRegistryManifest — rejects invalid variable (missing name)", () => {
  const manifest = {
    ...VALID_MINIMAL,
    recipes: [{
      ...VALID_RECIPE,
      variables: [{ description: "no name" }],
    }],
  };

  assert.assertThrows(
    () => registrySchema.validateRegistryManifest(manifest),
    Error,
    "Invalid recipe",
  );
});

Deno.test("validateRegistryManifest — accepts recipe with postInstall", () => {
  const manifest = {
    ...VALID_MINIMAL,
    recipes: [{
      ...VALID_RECIPE,
      postInstall: ["deno install", "deno task build"],
    }],
  };

  const result = registrySchema.validateRegistryManifest(manifest);

  assert.assertEquals(result.recipes[0]!.postInstall, [
    "deno install",
    "deno task build",
  ]);
});

Deno.test("validateRegistryManifest — rejects non-string postInstall entry", () => {
  const manifest = {
    ...VALID_MINIMAL,
    recipes: [{ ...VALID_RECIPE, postInstall: [123] }],
  };

  assert.assertThrows(
    () => registrySchema.validateRegistryManifest(manifest),
    Error,
    "Invalid recipe",
  );
});

Deno.test("validateRegistryManifest — accepts file with kind and provider", () => {
  const manifest = {
    ...VALID_MINIMAL,
    recipes: [{
      ...VALID_RECIPE,
      files: [
        {
          source: "src/",
          target: "pkg/src",
          kind: "folder",
          provider: "github",
        },
      ],
    }],
  };

  const result = registrySchema.validateRegistryManifest(manifest);
  const file = result.recipes[0]!.files[0]!;

  assert.assertEquals(file.kind, "folder");
  assert.assertEquals(file.provider, "github");
});

Deno.test("validateRegistryManifest — rejects invalid file kind", () => {
  const manifest = {
    ...VALID_MINIMAL,
    recipes: [{
      ...VALID_RECIPE,
      files: [{ source: "a", target: "b", kind: "symlink" }],
    }],
  };

  assert.assertThrows(
    () => registrySchema.validateRegistryManifest(manifest),
    Error,
    "Invalid recipe",
  );
});

Deno.test("validateRegistryManifest — rejects invalid file provider", () => {
  const manifest = {
    ...VALID_MINIMAL,
    recipes: [{
      ...VALID_RECIPE,
      files: [{ source: "a", target: "b", provider: "s3" }],
    }],
  };

  assert.assertThrows(
    () => registrySchema.validateRegistryManifest(manifest),
    Error,
    "Invalid recipe",
  );
});

Deno.test("validateRecipe — validates standalone recipe", () => {
  const recipe = registrySchema.validateRecipe(VALID_RECIPE);

  assert.assertEquals(recipe.name, "my-recipe");
});

Deno.test("validateRecipe — rejects invalid standalone recipe", () => {
  assert.assertThrows(
    () => registrySchema.validateRecipe({ name: "" }),
    Error,
    "Invalid recipe",
  );
});

Deno.test("validateRegistryManifest — existing recipes without new fields still valid", () => {
  const manifest = {
    ...VALID_MINIMAL,
    recipes: [VALID_RECIPE],
  };

  const result = registrySchema.validateRegistryManifest(manifest);
  const recipe = result.recipes[0]!;

  // New optional fields are undefined when not provided
  assert.assertEquals(recipe.requires, undefined);
  assert.assertEquals(recipe.variables, undefined);
  assert.assertEquals(recipe.postInstall, undefined);
});

Deno.test("isTemplateVariable — validates correctly", () => {
  assert.assertEquals(
    registrySchema.isTemplateVariable({
      name: "foo",
      description: "bar",
    }),
    true,
  );
  assert.assertEquals(
    registrySchema.isTemplateVariable({
      name: "foo",
      description: "bar",
      default: "baz",
      prompt: "Enter foo:",
    }),
    true,
  );
  assert.assertEquals(registrySchema.isTemplateVariable(null), false);
  assert.assertEquals(
    registrySchema.isTemplateVariable({ name: "", description: "x" }),
    false,
  );
  assert.assertEquals(
    registrySchema.isTemplateVariable({ name: "x", description: 123 }),
    false,
  );
});

// =============================================================================
// resolveRegistryUrl
// =============================================================================

Deno.test("resolveRegistryUrl — joins base and path", () => {
  const result = registrySchema.resolveRegistryUrl(
    "https://example.com/registry",
    "recipes/foo.ts",
  );

  assert.assertEquals(result, "https://example.com/registry/recipes/foo.ts");
});

Deno.test("resolveRegistryUrl — strips trailing slash from base", () => {
  const result = registrySchema.resolveRegistryUrl(
    "https://example.com/registry/",
    "recipes/foo.ts",
  );

  assert.assertEquals(result, "https://example.com/registry/recipes/foo.ts");
});

Deno.test("resolveRegistryUrl — strips leading slash from path", () => {
  const result = registrySchema.resolveRegistryUrl(
    "https://example.com/registry",
    "/recipes/foo.ts",
  );

  assert.assertEquals(result, "https://example.com/registry/recipes/foo.ts");
});
