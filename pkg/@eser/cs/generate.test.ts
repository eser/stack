// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals, assertStringIncludes } from "@std/assert";
import { generate } from "./generate.ts";
// No longer need ensureDir import

// Helper to create environment files for testing in temp directory
async function createEnvFile(
  env: string,
  content: Record<string, string>,
): Promise<string> {
  const tempDir = await Deno.makeTempDir({ prefix: "cs_test_" });
  const envContent = Object.entries(content)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  await Deno.writeTextFile(`${tempDir}/.env.${env}`, envContent);
  return tempDir;
}

// Helper to create default environment files (.env and .env.development)
async function createDefaultEnvFiles(
  content: Record<string, string>,
): Promise<string> {
  const tempDir = await Deno.makeTempDir({ prefix: "cs_test_" });
  const envContent = Object.entries(content)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  await Deno.writeTextFile(`${tempDir}/.env`, envContent);
  await Deno.writeTextFile(`${tempDir}/.env.development`, envContent);
  return tempDir;
}

// Helper to cleanup temp directory
async function cleanupTempDir(tempDir: string) {
  try {
    await Deno.remove(tempDir, { recursive: true });
  } catch {
    // Ignore if directory doesn't exist
  }
}

Deno.test("generate() should work without environment name", async () => {
  const tempDir = await createDefaultEnvFiles({
    "DEFAULT_VAR_1": "default-value-1",
    "DEFAULT_VAR_2": "default-value-2",
  });

  const originalCwd = Deno.cwd();

  try {
    Deno.chdir(tempDir);

    const result = await generate({
      resource: { type: "configmap", name: "test-config" },
      namespace: "test-namespace",
      format: "yaml",
      env: undefined,
    });

    assertStringIncludes(result, "apiVersion: v1");
    assertStringIncludes(result, "kind: ConfigMap");
    assertStringIncludes(result, "name: test-config");
    assertStringIncludes(result, "namespace: test-namespace");
    assertStringIncludes(result, "DEFAULT_VAR_1: default-value-1");
    assertStringIncludes(result, "DEFAULT_VAR_2: default-value-2");
  } finally {
    Deno.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  }
});

Deno.test("generate() should work with environment name", async () => {
  const tempDir = await createEnvFile("test", {
    "TEST_VAR_1": "test-value-1",
    "TEST_VAR_2": "test-value-2",
  });

  const originalCwd = Deno.cwd();

  try {
    Deno.chdir(tempDir);

    const result = await generate({
      resource: { type: "configmap", name: "test-config" },
      namespace: "test-namespace",
      format: "yaml",
      env: "test",
    });

    assertStringIncludes(result, "apiVersion: v1");
    assertStringIncludes(result, "kind: ConfigMap");
    assertStringIncludes(result, "name: test-config");
    assertStringIncludes(result, "namespace: test-namespace");
    assertStringIncludes(result, "TEST_VAR_1: test-value-1");
    assertStringIncludes(result, "TEST_VAR_2: test-value-2");
  } finally {
    Deno.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  }
});

Deno.test("generate() should handle JSON format", async () => {
  const tempDir = await createEnvFile("json-test-env", {
    "JSON_TEST_VAR": "json-test-value",
  });

  const originalCwd = Deno.cwd();

  try {
    Deno.chdir(tempDir);

    const result = await generate({
      resource: { type: "configmap", name: "json-test" },
      namespace: "test",
      format: "json",
      env: "json-test-env",
    });

    // Should be valid JSON
    const parsed = JSON.parse(result);
    assertEquals(Array.isArray(parsed), true);
    assertEquals(parsed[0].kind, "ConfigMap");
    assertEquals(parsed[0].metadata.name, "json-test");
    assertEquals(parsed[0].data["JSON_TEST_VAR"], "json-test-value");
  } finally {
    Deno.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  }
});

Deno.test("generate() should generate Secret resources", async () => {
  const tempDir = await createEnvFile("secret-test", {
    "SECRET_VAR_1": "secret-value-1",
    "SECRET_VAR_2": "secret-value-2",
  });

  const originalCwd = Deno.cwd();

  try {
    Deno.chdir(tempDir);

    const result = await generate({
      resource: { type: "secret", name: "test-secret" },
      namespace: "test-namespace",
      format: "yaml",
      env: "secret-test",
    });

    assertStringIncludes(result, "apiVersion: v1");
    assertStringIncludes(result, "kind: Secret");
    assertStringIncludes(result, "name: test-secret");
    assertStringIncludes(result, "namespace: test-namespace");
    assertStringIncludes(result, "type: Opaque");
  } finally {
    Deno.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  }
});

Deno.test("generate() should include environment variables", async () => {
  const tempDir = await createEnvFile("env-test", {
    "TEST_PROCESS_VAR": "from-process",
    "ANOTHER_TEST_VAR": "another-value",
  });

  const originalCwd = Deno.cwd();

  try {
    Deno.chdir(tempDir);

    const result = await generate({
      resource: { type: "configmap", name: "env-test" },
      format: "yaml",
      env: "env-test",
    });

    assertStringIncludes(result, "kind: ConfigMap");
    assertStringIncludes(result, "name: env-test");
    assertStringIncludes(result, "TEST_PROCESS_VAR: from-process");
    assertStringIncludes(result, "ANOTHER_TEST_VAR: another-value");
  } finally {
    Deno.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  }
});

Deno.test("generate() should work with different resource types", async () => {
  const tempDir = await createEnvFile("multi-test", {
    "CONFIG_VAR": "config-value",
    "SHARED_VAR": "shared-value",
  });

  const originalCwd = Deno.cwd();

  try {
    Deno.chdir(tempDir);

    const result = await generate({
      resource: { type: "configmap", name: "multi-test" },
      format: "yaml",
      env: "multi-test",
    });

    assertStringIncludes(result, "kind: ConfigMap");
    assertStringIncludes(result, "name: multi-test");
    assertStringIncludes(result, "CONFIG_VAR: config-value");
    assertStringIncludes(result, "SHARED_VAR: shared-value");
  } finally {
    Deno.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  }
});

Deno.test("generate() should capture runtime environment variables", async () => {
  const tempDir = await createEnvFile("runtime-test", {
    "RUNTIME_VAR1": "runtime-value-1",
    "RUNTIME_VAR2": "runtime-value-2",
  });

  const originalCwd = Deno.cwd();

  try {
    Deno.chdir(tempDir);

    const result = await generate({
      resource: { type: "configmap", name: "runtime-test" },
      format: "yaml",
      env: "runtime-test",
    });

    assertStringIncludes(result, "RUNTIME_VAR1: runtime-value-1");
    assertStringIncludes(result, "RUNTIME_VAR2: runtime-value-2");
  } finally {
    Deno.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  }
});

Deno.test("generate() should handle multiple environment variables", async () => {
  const tempDir = await createEnvFile("multi-var-test", {
    "VAR_1": "value-1",
    "VAR_2": "value-2",
    "VAR_3": "value-3",
  });

  const originalCwd = Deno.cwd();

  try {
    Deno.chdir(tempDir);

    const result = await generate({
      resource: { type: "configmap", name: "multi-var-test" },
      format: "yaml",
      env: "multi-var-test",
    });

    assertStringIncludes(result, "kind: ConfigMap");
    assertStringIncludes(result, "name: multi-var-test");
    assertStringIncludes(result, "VAR_1: value-1");
    assertStringIncludes(result, "VAR_2: value-2");
    assertStringIncludes(result, "VAR_3: value-3");
  } finally {
    Deno.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  }
});

Deno.test("generate() should work with --env flag", async () => {
  const tempDir = await createEnvFile("development", {
    "CUSTOM_ENV_VAR": "custom-value",
    "PROCESS_VAR": "process-value",
  });

  const originalCwd = Deno.cwd();

  try {
    Deno.chdir(tempDir);

    const result = await generate({
      resource: { type: "configmap", name: "custom-env-test" },
      format: "yaml",
      env: "development",
    });

    assertStringIncludes(result, "kind: ConfigMap");
    assertStringIncludes(result, "name: custom-env-test");
    assertStringIncludes(result, "CUSTOM_ENV_VAR: custom-value");
    assertStringIncludes(result, "PROCESS_VAR: process-value");
  } finally {
    Deno.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  }
});

Deno.test("generate() should include system environment variables", async () => {
  const tempDir = await createEnvFile("system-test", {
    "TEST_SYSTEM_VAR": "system-value",
  });

  const originalCwd = Deno.cwd();

  try {
    Deno.chdir(tempDir);

    const result = await generate({
      resource: { type: "configmap", name: "system-test" },
      format: "yaml",
      env: "system-test",
    });

    assertStringIncludes(result, "kind: ConfigMap");
    assertStringIncludes(result, "name: system-test");
    assertStringIncludes(result, "TEST_SYSTEM_VAR: system-value");
  } finally {
    Deno.chdir(originalCwd);
    await cleanupTempDir(tempDir);
  }
});
