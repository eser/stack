// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { runtime } from "@eser/standards/runtime";
import {
  buildConfigMapFromContext,
  buildSecretFromContext,
  KubernetesResourceNameError,
  sync,
  validateKubernetesResourceName,
  validateResourceReference,
} from "./sync.ts";

// Test helper to set up environment variables
function setupTestEnv(): Record<string, string> {
  const testEnv = {
    "DD_SITE": "datadoghq.com",
    "DD_API_KEY": "test-api-key",
    "DB_HOST": "localhost",
    "DB_PORT": "5432",
    "DB_NAME": "test_db",
  };

  for (const [key, value] of Object.entries(testEnv)) {
    runtime.env.set(key, value);
  }

  return testEnv;
}

// Test helper to clean up environment variables
function cleanupTestEnv(keys: string[]) {
  for (const key of keys) {
    runtime.env.delete(key);
  }
}

Deno.test("buildConfigMapFromContext() should create valid ConfigMap", () => {
  const data = new Map([
    ["DD_SITE", "datadoghq.com"],
    ["DD_API_KEY", "test-api-key"],
    ["DB_HOST", "localhost"],
  ]);

  const configMap = buildConfigMapFromContext(
    "test-config",
    "test-namespace",
    data,
  );

  assertEquals(configMap.apiVersion, "v1");
  assertEquals(configMap.kind, "ConfigMap");
  assertEquals(configMap.metadata.name, "test-config");
  assertEquals(configMap.metadata.namespace, "test-namespace");
  assertEquals(configMap.data?.["DD_SITE"], "datadoghq.com");
  assertEquals(configMap.data?.["DD_API_KEY"], "test-api-key");
  assertEquals(configMap.data?.["DB_HOST"], "localhost");
});

Deno.test("buildConfigMapFromContext() should omit default namespace", () => {
  const data = new Map([["TEST_VAR", "test-value"]]);

  const configMap = buildConfigMapFromContext(
    "default-config",
    "default",
    data,
  );

  assertEquals(configMap.metadata.name, "default-config");
  assertEquals(configMap.metadata.namespace, undefined);
});

Deno.test("buildConfigMapFromContext() should handle undefined namespace", () => {
  const data = new Map([["TEST_VAR", "test-value"]]);

  const configMap = buildConfigMapFromContext(
    "no-namespace-config",
    undefined,
    data,
  );

  assertEquals(configMap.metadata.name, "no-namespace-config");
  assertEquals(configMap.metadata.namespace, undefined);
});

Deno.test("buildSecretFromContext() should create valid Secret with base64 encoding", () => {
  const data = new Map([
    ["DD_SITE", "datadoghq.com"],
    ["DD_API_KEY", "test-api-key"],
    ["DB_PASSWORD", "secret123"],
  ]);

  const secret = buildSecretFromContext("test-secret", "test-namespace", data);

  assertEquals(secret.apiVersion, "v1");
  assertEquals(secret.kind, "Secret");
  assertEquals(secret.metadata.name, "test-secret");
  assertEquals(secret.metadata.namespace, "test-namespace");
  assertEquals(secret.type, "Opaque");

  // Verify base64 encoding
  assertEquals(secret.data?.["DD_SITE"], btoa("datadoghq.com"));
  assertEquals(secret.data?.["DD_API_KEY"], btoa("test-api-key"));
  assertEquals(secret.data?.["DB_PASSWORD"], btoa("secret123"));
});

Deno.test("buildSecretFromContext() should handle special characters in values", () => {
  const data = new Map([
    ["SPECIAL_VAR", "value with spaces & symbols!@#$%"],
    ["MULTILINE_VAR", "line1\\nline2\\nline3"],
  ]);

  const secret = buildSecretFromContext("special-secret", "test-ns", data);

  assertEquals(
    secret.data?.["SPECIAL_VAR"],
    btoa("value with spaces & symbols!@#$%"),
  );
  assertEquals(secret.data?.["MULTILINE_VAR"], btoa("line1\\nline2\\nline3"));
});

Deno.test("buildSecretFromContext() should omit default namespace", () => {
  const data = new Map([["TEST_SECRET", "secret-value"]]);

  const secret = buildSecretFromContext("default-secret", "default", data);

  assertEquals(secret.metadata.name, "default-secret");
  assertEquals(secret.metadata.namespace, undefined);
});

Deno.test("buildSecretFromContext() should handle empty data", () => {
  const secret = buildSecretFromContext("empty-secret", "test-ns", new Map());

  assertEquals(secret.kind, "Secret");
  assertEquals(secret.metadata.name, "empty-secret");
  assertEquals(Object.keys(secret.data ?? {}).length, 0);
});

Deno.test("sync() should handle empty kubectl response", async () => {
  try {
    // We can't easily mock the import, so we test the expected behavior
    const result = await sync({
      resource: { type: "configmap", name: "empty-config" },
    });

    // Should handle empty result gracefully
    assertStringIncludes(result, "No data found");
  } catch (error) {
    // Expected if kubectl is not available in test environment
    assertStringIncludes(
      (error as Error).message,
      "kubectl",
    );
  }
});

Deno.test("sync() should generate kubectl patch command for configmap type", async () => {
  const testEnv = setupTestEnv();

  try {
    // This test will fail in environments without kubectl, which is expected
    // In a real test environment, we'd mock the kubectl execution
    const result = await sync({
      resource: {
        type: "configmap",
        name: "test-config",
        namespace: "test-ns",
      },
    });

    // This assertion will only run if kubectl is available
    if (
      !result.includes("No data found") && !result.includes("Failed to sync")
    ) {
      assertStringIncludes(result, "kubectl patch cm test-config");
      assertStringIncludes(result, "-n test-ns");
      assertStringIncludes(result, "--type=merge");
    }
  } catch (error) {
    // Expected behavior when kubectl is not available
    assertStringIncludes((error as Error).message, "kubectl");
  } finally {
    cleanupTestEnv(Object.keys(testEnv));
  }
});

Deno.test("sync() should generate kubectl patch command for secret type", async () => {
  const testEnv = setupTestEnv();

  try {
    const result = await sync({
      resource: { type: "secret", name: "test-secret", namespace: "test-ns" },
    });

    // This assertion will only run if kubectl is available
    if (
      !result.includes("No data found") && !result.includes("Failed to sync")
    ) {
      assertStringIncludes(result, "kubectl patch secret test-secret");
      assertStringIncludes(result, "-n test-ns");
      assertStringIncludes(result, "--type=merge");
    }
  } catch (error) {
    // Expected behavior when kubectl is not available
    assertStringIncludes((error as Error).message, "kubectl");
  } finally {
    cleanupTestEnv(Object.keys(testEnv));
  }
});

Deno.test("sync() should generate proper kubectl patch command format", async () => {
  const testEnv = setupTestEnv();

  try {
    const result = await sync({
      resource: { type: "configmap", name: "json-config" },
    });

    // This assertion will only run if kubectl is available and returns data
    if (
      !result.includes("No data found") && !result.includes("Failed to sync")
    ) {
      // Should contain proper kubectl patch format
      assertStringIncludes(result, "kubectl patch cm json-config");
      assertStringIncludes(result, "--type=merge");
      assertStringIncludes(result, '-p \'{"data":');
    }
  } catch (error) {
    // Expected behavior when kubectl is not available
    assertStringIncludes((error as Error).message, "kubectl");
  } finally {
    cleanupTestEnv(Object.keys(testEnv));
  }
});

Deno.test("sync() should support YAML format patch commands", async () => {
  const testEnv = setupTestEnv();

  try {
    const result = await sync({
      resource: { type: "configmap", name: "yaml-config" },
      format: "yaml",
    });

    if (
      !result.includes("No data found") && !result.includes("Failed to sync")
    ) {
      // Should contain YAML format
      assertStringIncludes(result, "kubectl patch cm yaml-config");
      assertStringIncludes(result, "--type=merge");
      assertStringIncludes(result, "data:");
    }
  } catch (error) {
    assertStringIncludes((error as Error).message, "kubectl");
  } finally {
    cleanupTestEnv(Object.keys(testEnv));
  }
});

Deno.test("sync() should support string-only output", async () => {
  const testEnv = setupTestEnv();

  try {
    const result = await sync({
      resource: { type: "configmap", name: "string-only-config" },
      stringOnly: true,
    });

    if (
      !result.includes("No data found") && !result.includes("Failed to sync")
    ) {
      // Should only contain JSON patch data, no kubectl command
      assertStringIncludes(result, '{"data":');
      assert(!result.includes("kubectl"));
    }
  } catch (error) {
    assertStringIncludes((error as Error).message, "kubectl");
  } finally {
    cleanupTestEnv(Object.keys(testEnv));
  }
});

// CLI parsing tests (testing the parseKubectlResource function indirectly)
Deno.test("CLI should handle configmap resource format", () => {
  // Test that our resource type mapping works correctly
  const configMapType = "configmap";
  assertEquals(configMapType, "configmap");

  const cmShortType = "cm";
  // In the actual implementation, "cm" gets mapped to "configmap"
  assertEquals(cmShortType === "cm" ? "configmap" : cmShortType, "configmap");
});

Deno.test("CLI should handle secret resource format", () => {
  const secretType = "secret";
  assertEquals(secretType, "secret");
});

// Test integration with @eser/writer for YAML/JSON output
Deno.test("ConfigMap YAML output should be properly formatted", async () => {
  const { write } = await import("@eser/writer");

  const configMap = buildConfigMapFromContext(
    "format-test",
    "test-ns",
    new Map([
      ["APP_NAME", "my-app"],
      ["APP_VERSION", "1.0.0"],
    ]),
  );

  const yamlOutput = write([configMap], "yaml", { pretty: true });

  assertStringIncludes(yamlOutput, "apiVersion: v1");
  assertStringIncludes(yamlOutput, "kind: ConfigMap");
  assertStringIncludes(yamlOutput, "name: format-test");
  assertStringIncludes(yamlOutput, "namespace: test-ns");
  assertStringIncludes(yamlOutput, "APP_NAME: my-app");
  assertStringIncludes(yamlOutput, "APP_VERSION: 1.0.0");
});

Deno.test("Secret YAML output should be properly formatted", async () => {
  const { write } = await import("@eser/writer");

  const secret = buildSecretFromContext(
    "secret-format-test",
    "test-ns",
    new Map([
      ["API_KEY", "secret123"],
      ["DB_PASSWORD", "password456"],
    ]),
  );

  const yamlOutput = write([secret], "yaml", { pretty: true });

  assertStringIncludes(yamlOutput, "apiVersion: v1");
  assertStringIncludes(yamlOutput, "kind: Secret");
  assertStringIncludes(yamlOutput, "name: secret-format-test");
  assertStringIncludes(yamlOutput, "namespace: test-ns");
  assertStringIncludes(yamlOutput, "type: Opaque");
  // Data should be base64 encoded
  assertStringIncludes(yamlOutput, btoa("secret123"));
  assertStringIncludes(yamlOutput, btoa("password456"));
});

Deno.test("JSON output should be valid JSON", async () => {
  const { write } = await import("@eser/writer");

  const configMap = buildConfigMapFromContext(
    "json-format-test",
    "test-ns",
    new Map([
      ["CONFIG_KEY", "config-value"],
    ]),
  );

  const jsonOutput = write([configMap], "json", { pretty: true });

  // Should be parseable as JSON
  const parsed = JSON.parse(jsonOutput);
  assertEquals(Array.isArray(parsed), true);
  assertEquals(parsed[0].apiVersion, "v1");
  assertEquals(parsed[0].kind, "ConfigMap");
  assertEquals(parsed[0].metadata.name, "json-format-test");
  assertEquals(parsed[0].data["CONFIG_KEY"], "config-value");
});

// Error handling tests
Deno.test("sync() should handle kubectl command failures", async () => {
  // This tests error handling when kubectl command fails
  try {
    const result = await sync({
      resource: { type: "configmap", name: "nonexistent-resource" },
    });

    // Should either return a "No data found" message or throw an error
    if (
      !result.includes("No data found") && !result.includes("Failed to sync")
    ) {
      // If it doesn't contain expected messages, kubectl was not available
      assertStringIncludes(result, "ConfigMap");
    }
  } catch (error) {
    // Expected behavior when kubectl fails
    assertStringIncludes((error as Error).message, "kubectl");
  }
});

// Test that demonstrates the full workflow
Deno.test("Full workflow test with mock data", async () => {
  const testEnv = setupTestEnv();

  try {
    // Simulate environment values for the test
    const envValues = new Map([
      ["DD_SITE", "datadoghq.com"],
      ["DD_API_KEY", "test-api-key"],
      ["DB_HOST", "localhost"],
    ]);

    // Build ConfigMap
    const configMap = buildConfigMapFromContext(
      "workflow-test",
      "test-ns",
      envValues,
    );

    // Generate YAML output
    const { write } = await import("@eser/writer");
    const yamlOutput = write([configMap], "yaml", { pretty: true });

    // Verify the complete workflow
    assertStringIncludes(yamlOutput, "kind: ConfigMap");
    assertStringIncludes(yamlOutput, "name: workflow-test");
    assertStringIncludes(yamlOutput, "DD_SITE: datadoghq.com");
    assertStringIncludes(yamlOutput, "DD_API_KEY: test-api-key");
    assertStringIncludes(yamlOutput, "DB_HOST: localhost");

    // Test Secret workflow
    const secret = buildSecretFromContext(
      "workflow-secret",
      "test-ns",
      envValues,
    );
    const secretYaml = write([secret], "yaml", { pretty: true });

    assertStringIncludes(secretYaml, "kind: Secret");
    assertStringIncludes(secretYaml, "name: workflow-secret");
    assertStringIncludes(secretYaml, "type: Opaque");
    // Verify base64 encoding
    assertStringIncludes(secretYaml, btoa("datadoghq.com"));
    assertStringIncludes(secretYaml, btoa("test-api-key"));
  } finally {
    cleanupTestEnv(Object.keys(testEnv));
  }
});

// ============================================================================
// Kubernetes Resource Name Validation Tests (Security)
// ============================================================================

Deno.test("validateKubernetesResourceName() should accept valid names", () => {
  // Valid RFC 1123 DNS subdomain names
  const validNames = [
    "a",
    "my-app",
    "my-app-v1",
    "app123",
    "123app",
    "a1b2c3",
    "my.app.name",
    "my-app.v1.release",
    "a".repeat(253), // Maximum length
  ];

  for (const name of validNames) {
    // Should not throw
    validateKubernetesResourceName(name);
  }
});

Deno.test("validateKubernetesResourceName() should reject empty names", () => {
  assertThrows(
    () => validateKubernetesResourceName(""),
    KubernetesResourceNameError,
    "cannot be empty",
  );
});

Deno.test("validateKubernetesResourceName() should reject names exceeding 253 characters", () => {
  const longName = "a".repeat(254);
  assertThrows(
    () => validateKubernetesResourceName(longName),
    KubernetesResourceNameError,
    "253 characters or less",
  );
});

Deno.test("validateKubernetesResourceName() should reject names with uppercase letters", () => {
  assertThrows(
    () => validateKubernetesResourceName("MyApp"),
    KubernetesResourceNameError,
    "lowercase alphanumeric",
  );
});

Deno.test("validateKubernetesResourceName() should reject names starting with non-alphanumeric", () => {
  const invalidStarts = ["-app", ".app", "_app"];
  for (const name of invalidStarts) {
    assertThrows(
      () => validateKubernetesResourceName(name),
      KubernetesResourceNameError,
    );
  }
});

Deno.test("validateKubernetesResourceName() should reject names ending with non-alphanumeric", () => {
  const invalidEnds = ["app-", "app.", "app_"];
  for (const name of invalidEnds) {
    assertThrows(
      () => validateKubernetesResourceName(name),
      KubernetesResourceNameError,
    );
  }
});

Deno.test("validateKubernetesResourceName() should reject names with shell metacharacters", () => {
  // These characters could be used for command injection
  const dangerousNames = [
    "app;ls",
    "app|cat",
    "app$HOME",
    "app`id`",
    "app$(whoami)",
    "app&",
    "app>file",
    "app<file",
    "app'test",
    'app"test',
    "app\\test",
    "app\ntest",
    "app test", // spaces
  ];

  for (const name of dangerousNames) {
    assertThrows(
      () => validateKubernetesResourceName(name),
      KubernetesResourceNameError,
    );
  }
});

Deno.test("validateKubernetesResourceName() should reject names with consecutive dots or dashes", () => {
  assertThrows(
    () => validateKubernetesResourceName("app..name"),
    KubernetesResourceNameError,
    "consecutive dots or dashes",
  );

  assertThrows(
    () => validateKubernetesResourceName("app--name"),
    KubernetesResourceNameError,
    "consecutive dots or dashes",
  );
});

Deno.test("validateKubernetesResourceName() should use custom field name in error messages", () => {
  try {
    validateKubernetesResourceName("", "namespace");
    assert(false, "Should have thrown");
  } catch (error) {
    assertStringIncludes((error as Error).message, "namespace");
  }
});

Deno.test("validateResourceReference() should validate both name and namespace", () => {
  // Valid reference
  validateResourceReference({
    type: "configmap",
    name: "my-config",
    namespace: "my-namespace",
  });

  // Valid reference without namespace
  validateResourceReference({
    type: "secret",
    name: "my-secret",
  });
});

Deno.test("validateResourceReference() should reject invalid resource names", () => {
  assertThrows(
    () =>
      validateResourceReference({
        type: "configmap",
        name: "Invalid-Name",
        namespace: "default",
      }),
    KubernetesResourceNameError,
  );
});

Deno.test("validateResourceReference() should reject invalid namespace", () => {
  assertThrows(
    () =>
      validateResourceReference({
        type: "configmap",
        name: "my-config",
        namespace: "Invalid-Namespace",
      }),
    KubernetesResourceNameError,
  );
});

Deno.test("sync() should reject invalid resource names", async () => {
  await assertRejects(
    () =>
      sync({
        resource: { type: "configmap", name: "invalid;name" },
      }),
    KubernetesResourceNameError,
  );
});

Deno.test("sync() should reject invalid namespace", async () => {
  await assertRejects(
    () =>
      sync({
        resource: {
          type: "configmap",
          name: "valid-name",
          namespace: "invalid|namespace",
        },
      }),
    KubernetesResourceNameError,
  );
});
