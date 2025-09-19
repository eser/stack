// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals, assertStringIncludes } from "@std/assert";
import { generate } from "./generate.ts";

// Helper function to create safe test environments
async function createTestEnv(
  envFileContent: string,
): Promise<
  { tempDir: string; envFilePath: string; cleanup: () => Promise<void> }
> {
  const tempDir = await Deno.makeTempDir({ prefix: "cs_test_" });
  const envFilePath = `${tempDir}/.env`;
  await Deno.writeTextFile(envFilePath, envFileContent);

  const cleanup = async () => {
    try {
      await Deno.remove(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  };

  return { tempDir, envFilePath, cleanup };
}

Deno.test("generate() should require envFile parameter", async () => {
  try {
    await generate({
      resource: { type: "configmap", name: "test-config" },
      namespace: "test-namespace",
      format: "yaml",
    });
    // Should throw an error
    throw new Error("Expected error for missing envFile");
  } catch (error) {
    assertStringIncludes(
      (error as Error).message,
      "Environment file is required for generate command",
    );
  }
});

Deno.test("generate() should work with environment file", async () => {
  const envContent = "TEST_VAR_1=test-value-1\nTEST_VAR_2=test-value-2\n";
  const { envFilePath, cleanup } = await createTestEnv(envContent);

  try {
    const result = await generate({
      resource: { type: "configmap", name: "test-config" },
      namespace: "test-namespace",
      format: "yaml",
      envFile: envFilePath,
    });

    assertStringIncludes(result, "apiVersion: v1");
    assertStringIncludes(result, "kind: ConfigMap");
    assertStringIncludes(result, "name: test-config");
    assertStringIncludes(result, "namespace: test-namespace");
    assertStringIncludes(result, "TEST_VAR_1: test-value-1");
    assertStringIncludes(result, "TEST_VAR_2: test-value-2");
  } finally {
    await cleanup();
  }
});

Deno.test("generate() should handle JSON format", async () => {
  const envContent = "JSON_TEST_VAR=json-test-value\n";
  const { envFilePath, cleanup } = await createTestEnv(envContent);

  try {
    const result = await generate({
      resource: { type: "configmap", name: "json-test" },
      namespace: "test",
      format: "json",
      envFile: envFilePath,
    });

    // Should be valid JSON
    const parsed = JSON.parse(result);
    assertEquals(Array.isArray(parsed), true);
    assertEquals(parsed[0].kind, "ConfigMap");
    assertEquals(parsed[0].metadata.name, "json-test");
    assertEquals(parsed[0].data["JSON_TEST_VAR"], "json-test-value");
  } finally {
    await cleanup();
  }
});

Deno.test("generate() should generate Secret resources", async () => {
  const envContent =
    "SECRET_VAR_1=secret-value-1\nSECRET_VAR_2=secret-value-2\n";
  const { envFilePath, cleanup } = await createTestEnv(envContent);

  try {
    const result = await generate({
      resource: { type: "secret", name: "test-secret" },
      namespace: "test-namespace",
      format: "yaml",
      envFile: envFilePath,
    });

    assertStringIncludes(result, "apiVersion: v1");
    assertStringIncludes(result, "kind: Secret");
    assertStringIncludes(result, "name: test-secret");
    assertStringIncludes(result, "namespace: test-namespace");
    assertStringIncludes(result, "type: Opaque");
    // Check that values are base64 encoded
    assertStringIncludes(result, btoa("secret-value-1"));
    assertStringIncludes(result, btoa("secret-value-2"));
  } finally {
    await cleanup();
  }
});

Deno.test("process environment variables should override .env files", async () => {
  // Create a safe test environment
  const envContent = "TEST_OVERRIDE=from-env-file\nTEST_ONLY_FILE=file-only\n";
  const { envFilePath, cleanup } = await createTestEnv(envContent);

  // Set process environment variable with same key
  Deno.env.set("TEST_OVERRIDE", "from-process");
  Deno.env.set("TEST_ONLY_PROCESS", "process-only");

  try {
    const result = await generate({
      resource: { type: "configmap", name: "override-test" },
      format: "yaml",
      envFile: envFilePath,
    });

    // Process env should take precedence over .env file
    assertStringIncludes(result, "TEST_OVERRIDE: from-process");
    assertStringIncludes(result, "TEST_ONLY_PROCESS: process-only");
    assertStringIncludes(result, "TEST_ONLY_FILE: file-only");
  } finally {
    // Clean up
    Deno.env.delete("TEST_OVERRIDE");
    Deno.env.delete("TEST_ONLY_PROCESS");
    await cleanup();
  }
});

Deno.test("multiple environment sources should work together", async () => {
  // Create a safe test environment
  const envContent = "ENV_FILE_VAR=file-value\nSHARED_VAR=from-file\n";
  const { envFilePath, cleanup } = await createTestEnv(envContent);

  // Set some process environment variables
  Deno.env.set("PROCESS_VAR", "process-value");
  Deno.env.set("SHARED_VAR", "from-process"); // This should override the file

  try {
    const result = await generate({
      resource: { type: "configmap", name: "multi-source-test" },
      format: "yaml",
      envFile: envFilePath,
    });

    // Should include variables from both sources
    assertStringIncludes(result, "ENV_FILE_VAR: file-value");
    assertStringIncludes(result, "PROCESS_VAR: process-value");
    assertStringIncludes(result, "SHARED_VAR: from-process"); // Process should win
  } finally {
    // Clean up
    Deno.env.delete("PROCESS_VAR");
    Deno.env.delete("SHARED_VAR");
    await cleanup();
  }
});

Deno.test("runtime environment variables should be captured from env file", async () => {
  // Create env file with runtime-style variables
  const envContent =
    "RUNTIME_VAR1=runtime-value-1\nRUNTIME_VAR2=runtime-value-2\n";
  const { envFilePath, cleanup } = await createTestEnv(envContent);

  try {
    const result = await generate({
      resource: { type: "configmap", name: "runtime-test" },
      format: "yaml",
      envFile: envFilePath,
    });

    assertStringIncludes(result, "RUNTIME_VAR1: runtime-value-1");
    assertStringIncludes(result, "RUNTIME_VAR2: runtime-value-2");
  } finally {
    await cleanup();
  }
});

Deno.test("generate() should use both env file and system env vars", async () => {
  // Create env file with some vars
  const envContent = "FILE_ONLY_VAR=file-only-value\nSHARED_VAR=from-file\n";
  const { envFilePath, cleanup } = await createTestEnv(envContent);

  // Set only process environment variables
  Deno.env.set("PROCESS_ONLY_VAR", "process-only-value");
  Deno.env.set("SHARED_VAR", "from-process");

  try {
    const result = await generate({
      resource: { type: "configmap", name: "combined-env-test" },
      format: "yaml",
      envFile: envFilePath,
    });

    // Should include vars from both sources, with process vars overriding file
    assertStringIncludes(result, "kind: ConfigMap");
    assertStringIncludes(result, "name: combined-env-test");
    assertStringIncludes(result, "FILE_ONLY_VAR: file-only-value");
    assertStringIncludes(result, "PROCESS_ONLY_VAR: process-only-value");
    assertStringIncludes(result, "SHARED_VAR: from-process");
  } finally {
    // Clean up
    Deno.env.delete("PROCESS_ONLY_VAR");
    Deno.env.delete("SHARED_VAR");
    await cleanup();
  }
});

Deno.test("--reference-env-file flag should load custom environment file", async () => {
  // Create a safe test environment
  const customEnvContent =
    "CUSTOM_ENV_VAR=custom-value\nANOTHER_CUSTOM_VAR=another-value\n";
  const { envFilePath, cleanup } = await createTestEnv(customEnvContent);

  // Set a process environment variable with same key to test precedence
  Deno.env.set("CUSTOM_ENV_VAR", "process-override");
  Deno.env.set("PROCESS_ONLY_VAR", "process-only");

  try {
    const result = await generate({
      resource: { type: "configmap", name: "custom-env-test" },
      format: "yaml",
      envFile: envFilePath,
    });

    // Process env should take precedence over custom env file
    assertStringIncludes(result, "CUSTOM_ENV_VAR: process-override");
    assertStringIncludes(result, "ANOTHER_CUSTOM_VAR: another-value");
    assertStringIncludes(result, "PROCESS_ONLY_VAR: process-only");
    assertStringIncludes(result, "kind: ConfigMap");
    assertStringIncludes(result, "name: custom-env-test");
  } finally {
    // Clean up
    Deno.env.delete("CUSTOM_ENV_VAR");
    Deno.env.delete("PROCESS_ONLY_VAR");
    await cleanup();
  }
});

Deno.test("generate() should handle empty environment file with system vars", async () => {
  // Create empty env file
  const { envFilePath, cleanup } = await createTestEnv("");

  // Set a system env var to verify it's included
  Deno.env.set("TEST_SYSTEM_VAR", "system-value");

  try {
    const result = await generate({
      resource: { type: "configmap", name: "empty-test" },
      format: "yaml",
      envFile: envFilePath,
    });

    // Should still include system environment variables even with empty file
    assertStringIncludes(result, "kind: ConfigMap");
    assertStringIncludes(result, "name: empty-test");
    assertStringIncludes(result, "TEST_SYSTEM_VAR: system-value");
  } finally {
    Deno.env.delete("TEST_SYSTEM_VAR");
    await cleanup();
  }
});
