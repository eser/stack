// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assertEquals, assertStringIncludes } from "@std/assert";
import { generate } from "./generate.ts";
import { getDefaultConfig } from "./config.ts";
import { buildConfigMap, createConfigMapContext } from "./builders.ts";
import type { SyncConfig } from "./types.ts";

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

Deno.test("generate() should work with environment variables", async () => {
  // Set test environment variables
  Deno.env.set("TEST_VAR_1", "test-value-1");
  Deno.env.set("TEST_VAR_2", "test-value-2");

  try {
    const result = await generate({
      name: "test-config",
      namespace: "test-namespace",
      format: "yaml",
    });

    assertStringIncludes(result, "apiVersion: v1");
    assertStringIncludes(result, "kind: ConfigMap");
    assertStringIncludes(result, "name: test-config");
    assertStringIncludes(result, "namespace: test-namespace");
  } finally {
    // Clean up
    Deno.env.delete("TEST_VAR_1");
    Deno.env.delete("TEST_VAR_2");
  }
});

Deno.test("generate() should handle JSON format", async () => {
  // Set test environment variable
  Deno.env.set("JSON_TEST_VAR", "json-test-value");

  try {
    const result = await generate({
      name: "json-test",
      namespace: "test",
      format: "json",
    });

    // Should be valid JSON
    const parsed = JSON.parse(result);
    assertEquals(Array.isArray(parsed), true);
    if (parsed.length > 0) {
      assertEquals(parsed[0].kind, "ConfigMap");
      assertEquals(parsed[0].metadata.name, "json-test");
    }
  } finally {
    // Clean up
    Deno.env.delete("JSON_TEST_VAR");
  }
});

Deno.test("buildConfigMap() should generate ConfigMap with data", () => {
  const testConfig = getDefaultConfig();
  testConfig.configMap.name = "config-only-test";
  testConfig.configMap.data = {
    "app.properties": "server.port=8080",
    "logging.yaml": "level: debug",
  };

  const context = createConfigMapContext(testConfig, {});
  const configMap = buildConfigMap(context);

  assertEquals(configMap?.kind, "ConfigMap");
  assertEquals(configMap?.metadata.name, "config-only-test");
  assertEquals(configMap?.data?.["app.properties"], "server.port=8080");
  assertEquals(configMap?.data?.["logging.yaml"], "level: debug");
});

Deno.test("buildConfigMap() should merge env data with config data", () => {
  const testConfig = getDefaultConfig();
  testConfig.configMap.name = "merge-test";
  testConfig.configMap.data = {
    "config.properties": "server.port=8080",
  };

  const envData = {
    "DATABASE_URL": "postgresql://localhost:5432/mydb",
    "API_KEY": "secret-key-123",
  };

  const context = createConfigMapContext(testConfig, envData);
  const configMap = buildConfigMap(context);

  assertEquals(configMap?.kind, "ConfigMap");
  assertEquals(configMap?.metadata.name, "merge-test");
  assertEquals(configMap?.data?.["config.properties"], "server.port=8080");
  assertEquals(
    configMap?.data?.["DATABASE_URL"],
    "postgresql://localhost:5432/mydb",
  );
  assertEquals(configMap?.data?.["API_KEY"], "secret-key-123");
});

Deno.test("buildConfigMap() should handle labels and annotations", () => {
  const testConfig: SyncConfig = {
    configMap: {
      name: "labeled-config",
      namespace: "production",
      data: { "app.properties": "server.port=8080" },
      labels: {
        "app": "my-app",
        "version": "v1.0.0",
      },
      annotations: {
        "created-by": "config-sync",
        "last-updated": "2023-12-01",
      },
    },
    output: { format: "yaml", pretty: true },
  };

  const context = createConfigMapContext(testConfig, {});
  const configMap = buildConfigMap(context);

  assertEquals(configMap?.metadata.labels?.["app"], "my-app");
  assertEquals(configMap?.metadata.labels?.["version"], "v1.0.0");
  assertEquals(configMap?.metadata.annotations?.["created-by"], "config-sync");
  assertEquals(configMap?.metadata.annotations?.["last-updated"], "2023-12-01");
});

Deno.test("buildConfigMap() should handle namespace properly", () => {
  const testConfig = getDefaultConfig();
  testConfig.configMap.name = "namespaced-config";
  testConfig.configMap.namespace = "production";
  testConfig.configMap.data = { "config": "value" };

  const context = createConfigMapContext(testConfig, {});
  const configMap = buildConfigMap(context);

  assertEquals(configMap?.kind, "ConfigMap");
  assertEquals(configMap?.metadata.name, "namespaced-config");
  assertEquals(configMap?.metadata.namespace, "production");
});

Deno.test("buildConfigMap() should not include namespace for default", () => {
  const testConfig = getDefaultConfig();
  testConfig.configMap.name = "default-config";
  testConfig.configMap.namespace = "default";
  testConfig.configMap.data = { "config": "value" };

  const context = createConfigMapContext(testConfig, {});
  const configMap = buildConfigMap(context);

  assertEquals(configMap?.kind, "ConfigMap");
  assertEquals(configMap?.metadata.name, "default-config");
  assertEquals(configMap?.metadata.namespace, undefined); // Should not include default namespace
});

Deno.test("process environment variables should override .env files", async () => {
  // Create a safe test environment
  const envContent = "TEST_OVERRIDE=from-env-file\nTEST_ONLY_FILE=file-only\n";
  const { tempDir, cleanup } = await createTestEnv(envContent);

  // Set process environment variable with same key
  Deno.env.set("TEST_OVERRIDE", "from-process");
  Deno.env.set("TEST_ONLY_PROCESS", "process-only");

  try {
    const result = await generate({
      name: "override-test",
      format: "yaml",
      baseDir: tempDir,
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
  const { tempDir, cleanup } = await createTestEnv(envContent);

  // Set some process environment variables
  Deno.env.set("PROCESS_VAR", "process-value");
  Deno.env.set("SHARED_VAR", "from-process"); // This should override the file

  try {
    const result = await generate({
      name: "multi-source-test",
      format: "yaml",
      baseDir: tempDir,
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

Deno.test("runtime environment variables should be captured", async () => {
  // Simulate runtime environment variables (like TEST_VAR=123 deno run ...)
  const originalVars: Record<string, string | undefined> = {};

  // Save original values
  originalVars["RUNTIME_VAR1"] = Deno.env.get("RUNTIME_VAR1");
  originalVars["RUNTIME_VAR2"] = Deno.env.get("RUNTIME_VAR2");

  // Set runtime-style environment variables
  Deno.env.set("RUNTIME_VAR1", "runtime-value-1");
  Deno.env.set("RUNTIME_VAR2", "runtime-value-2");

  try {
    const result = await generate({
      name: "runtime-test",
      format: "yaml",
    });

    assertStringIncludes(result, "RUNTIME_VAR1: runtime-value-1");
    assertStringIncludes(result, "RUNTIME_VAR2: runtime-value-2");
  } finally {
    // Restore original environment
    for (const [key, value] of Object.entries(originalVars)) {
      if (value === undefined) {
        Deno.env.delete(key);
      } else {
        Deno.env.set(key, value);
      }
    }
  }
});

Deno.test("should handle missing .env file with process env vars", async () => {
  // Set only process environment variables (no .env file)
  Deno.env.set("PROCESS_ONLY_VAR", "process-only-value");
  Deno.env.set("ANOTHER_PROCESS_VAR", "another-value");

  try {
    const result = await generate({
      name: "no-env-file-test",
      format: "yaml",
    });

    // Should still work with just process env vars
    assertStringIncludes(result, "kind: ConfigMap");
    assertStringIncludes(result, "name: no-env-file-test");
    assertStringIncludes(result, "PROCESS_ONLY_VAR: process-only-value");
    assertStringIncludes(result, "ANOTHER_PROCESS_VAR: another-value");
  } finally {
    // Clean up
    Deno.env.delete("PROCESS_ONLY_VAR");
    Deno.env.delete("ANOTHER_PROCESS_VAR");
  }
});

Deno.test("--env-file flag should load custom environment file", async () => {
  // Create a safe test environment
  const customEnvContent =
    "CUSTOM_ENV_VAR=custom-value\nANOTHER_CUSTOM_VAR=another-value\n";
  const { envFilePath, cleanup } = await createTestEnv(customEnvContent);

  // Set a process environment variable with same key to test precedence
  Deno.env.set("CUSTOM_ENV_VAR", "process-override");
  Deno.env.set("PROCESS_ONLY_VAR", "process-only");

  try {
    const result = await generate({
      name: "custom-env-test",
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

Deno.test("default config should have correct structure", () => {
  // Test the structure without relying on potentially mutated state
  const config = getDefaultConfig();

  // Test that the structure is correct regardless of values
  assertEquals(typeof config.configMap.name, "string");
  assertEquals(typeof config.configMap.namespace, "string");
  assertEquals(typeof config.output?.format, "string");
  assertEquals(typeof config.output?.pretty, "boolean");
  assertEquals(typeof config.configMap.data, "object");
  assertEquals(typeof config.configMap.labels, "object");
  assertEquals(typeof config.configMap.annotations, "object");
});
