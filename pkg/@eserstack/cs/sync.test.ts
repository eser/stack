// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as formats from "@eserstack/formats";
import * as dotenv from "@eserstack/config/dotenv";
import * as sync from "./sync.ts";
import type * as types from "./types.ts";

// The process environment is loaded on top of the .env files, so the keys in
// these tests carry a prefix no real variable uses.
const HOST_KEY = "CS_SYNC_TEST_HOST";
const PORT_KEY = "CS_SYNC_TEST_PORT";
const MISSING_KEY = "CS_SYNC_TEST_MISSING";

// Writes the given files into a new temporary directory, which sync() reads
// through its cwd option instead of the working directory.
async function createEnvDir(
  files: Record<string, Record<string, string>>,
): Promise<string> {
  const dir = await runtime.fs.makeTempDir({ prefix: "cs_sync_test_" });
  await Promise.all(
    Object.entries(files).map(([fileName, values]) => {
      const content = Object.entries(values)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");
      return runtime.fs.writeTextFile(`${dir}/${fileName}`, content);
    }),
  );
  return dir;
}

// A key lookup that stands in for kubectl and records each resource it reads.
function fakeResourceKeys(keys: ReadonlyArray<string>): {
  readonly lookup: (
    resource: types.KubectlResourceReference,
  ) => Promise<ReadonlyArray<string>>;
  readonly calls: types.KubectlResourceReference[];
} {
  const calls: types.KubectlResourceReference[] = [];
  return {
    lookup: (resource) => {
      calls.push(resource);
      return Promise.resolve(keys);
    },
    calls,
  };
}

nodeTest.test(
  "buildConfigMapFromContext() should create valid ConfigMap",
  () => {
    const data = new Map([
      ["DD_SITE", "datadoghq.com"],
      ["DD_API_KEY", "test-api-key"],
      ["DB_HOST", "localhost"],
    ]);

    const configMap = sync.buildConfigMapFromContext(
      "test-config",
      "test-namespace",
      data,
    );

    assert.assertEquals(configMap.apiVersion, "v1");
    assert.assertEquals(configMap.kind, "ConfigMap");
    assert.assertEquals(configMap.metadata.name, "test-config");
    assert.assertEquals(configMap.metadata.namespace, "test-namespace");
    assert.assertEquals(configMap.data?.["DD_SITE"], "datadoghq.com");
    assert.assertEquals(configMap.data?.["DD_API_KEY"], "test-api-key");
    assert.assertEquals(configMap.data?.["DB_HOST"], "localhost");
  },
);

nodeTest.test(
  "buildConfigMapFromContext() should omit default namespace",
  () => {
    const data = new Map([["TEST_VAR", "test-value"]]);

    const configMap = sync.buildConfigMapFromContext(
      "default-config",
      "default",
      data,
    );

    assert.assertEquals(configMap.metadata.name, "default-config");
    assert.assertEquals(configMap.metadata.namespace, undefined);
  },
);

nodeTest.test(
  "buildConfigMapFromContext() should handle undefined namespace",
  () => {
    const data = new Map([["TEST_VAR", "test-value"]]);

    const configMap = sync.buildConfigMapFromContext(
      "no-namespace-config",
      undefined,
      data,
    );

    assert.assertEquals(configMap.metadata.name, "no-namespace-config");
    assert.assertEquals(configMap.metadata.namespace, undefined);
  },
);

nodeTest.test(
  "buildSecretFromContext() should create valid Secret with base64 encoding",
  () => {
    const data = new Map([
      ["DD_SITE", "datadoghq.com"],
      ["DD_API_KEY", "test-api-key"],
      ["DB_PASSWORD", "secret123"],
    ]);

    const secret = sync.buildSecretFromContext(
      "test-secret",
      "test-namespace",
      data,
    );

    assert.assertEquals(secret.apiVersion, "v1");
    assert.assertEquals(secret.kind, "Secret");
    assert.assertEquals(secret.metadata.name, "test-secret");
    assert.assertEquals(secret.metadata.namespace, "test-namespace");
    assert.assertEquals(secret.type, "Opaque");

    // Verify base64 encoding
    assert.assertEquals(secret.data?.["DD_SITE"], btoa("datadoghq.com"));
    assert.assertEquals(secret.data?.["DD_API_KEY"], btoa("test-api-key"));
    assert.assertEquals(secret.data?.["DB_PASSWORD"], btoa("secret123"));
  },
);

nodeTest.test(
  "buildSecretFromContext() should handle special characters in values",
  () => {
    const data = new Map([
      ["SPECIAL_VAR", "value with spaces & symbols!@#$%"],
      ["MULTILINE_VAR", "line1\\nline2\\nline3"],
    ]);

    const secret = sync.buildSecretFromContext(
      "special-secret",
      "test-ns",
      data,
    );

    assert.assertEquals(
      secret.data?.["SPECIAL_VAR"],
      btoa("value with spaces & symbols!@#$%"),
    );
    assert.assertEquals(
      secret.data?.["MULTILINE_VAR"],
      btoa("line1\\nline2\\nline3"),
    );
  },
);

nodeTest.test(
  "buildSecretFromContext() should encode values as UTF-8 base64",
  () => {
    const data = new Map([
      ["LATIN", "ü"],
      ["TURKISH", "ğış"],
    ]);

    const secret = sync.buildSecretFromContext("utf8-secret", undefined, data);

    // The bytes Kubernetes decodes are the UTF-8 bytes of the value, as the Go
    // csfx writes them; btoa would encode "ü" as one Latin-1 byte and throw on
    // "ğ".
    assert.assertEquals(secret.data, { LATIN: "w7w=", TURKISH: "xJ/EscWf" });
  },
);

nodeTest.test(
  "build*FromContext() leave out the env name entry and sort the keys",
  async () => {
    const dir = await createEnvDir({ ".env": { ZED: "z", ALPHA: "a" } });
    const envMap = await dotenv.load({
      baseDir: dir,
      env: "staging",
      loadProcessEnv: false,
    });

    // The loader's map carries the environment name under a symbol key, which
    // is not a variable; the Go csfx writes the keys sorted.
    assert.assertEquals(
      Object.keys(
        sync.buildSecretFromContext("s", undefined, envMap).data ?? {},
      ),
      ["ALPHA", "ZED"],
    );
    assert.assertEquals(
      Object.keys(
        sync.buildConfigMapFromContext("c", undefined, envMap).data ?? {},
      ),
      ["ALPHA", "ZED"],
    );
  },
);

nodeTest.test("buildSecretFromContext() should omit default namespace", () => {
  const data = new Map([["TEST_SECRET", "secret-value"]]);

  const secret = sync.buildSecretFromContext("default-secret", "default", data);

  assert.assertEquals(secret.metadata.name, "default-secret");
  assert.assertEquals(secret.metadata.namespace, undefined);
});

nodeTest.test("buildSecretFromContext() should handle empty data", () => {
  const secret = sync.buildSecretFromContext(
    "empty-secret",
    "test-ns",
    new Map(),
  );

  assert.assertEquals(secret.kind, "Secret");
  assert.assertEquals(secret.metadata.name, "empty-secret");
  assert.assertEquals(Object.keys(secret.data ?? {}).length, 0);
});

nodeTest.test(
  "buildConfigMapFromContext() and buildSecretFromContext() omit an empty namespace",
  () => {
    const data = new Map([["TEST_VAR", "test-value"]]);

    const configMap = sync.buildConfigMapFromContext("empty-ns", "", data);
    const secret = sync.buildSecretFromContext("empty-ns", "", data);

    assert.assertEquals(configMap.metadata.namespace, undefined);
    assert.assertEquals(secret.metadata.namespace, undefined);
  },
);

nodeTest.test(
  "sync() calls onMissingKey for a key the environment lacks and leaves it out of the patch",
  async () => {
    const dir = await createEnvDir({ ".env": { [HOST_KEY]: "localhost" } });
    const keys = fakeResourceKeys([HOST_KEY, MISSING_KEY]);
    const missing: string[] = [];

    try {
      const result = await sync.sync({
        resource: { type: "configmap", name: "app-config" },
        cwd: dir,
        stringOnly: true,
        getResourceKeys: keys.lookup,
        onMissingKey: (key) => missing.push(key),
      });

      assert.assertEquals(missing, [MISSING_KEY]);
      assert.assertEquals(JSON.parse(result), {
        data: { [HOST_KEY]: "localhost" },
      });
    } finally {
      await runtime.fs.remove(dir, { recursive: true });
    }
  },
);

const patchCases = [
  {
    name: "sync() builds a kubectl patch command for a configmap",
    resource: { type: "configmap", name: "app-config", namespace: "test-ns" },
    format: undefined,
    stringOnly: undefined,
    expected: `kubectl patch cm app-config -n test-ns --type=merge -p '{"data":{"${HOST_KEY}":"localhost","${PORT_KEY}":"5432"}}'`,
  },
  {
    name: "sync() Base64-encodes the values of a secret patch",
    resource: { type: "secret", name: "app-secret", namespace: "test-ns" },
    format: undefined,
    stringOnly: undefined,
    expected: `kubectl patch secret app-secret -n test-ns --type=merge -p '{"data":{"${HOST_KEY}":"${btoa(
      "localhost",
    )}","${PORT_KEY}":"${btoa("5432")}"}}'`,
  },
  {
    name: "sync() leaves out -n when the resource has no namespace",
    resource: { type: "configmap", name: "app-config" },
    format: undefined,
    stringOnly: true,
    expected: `{"data":{"${HOST_KEY}":"localhost","${PORT_KEY}":"5432"}}`,
  },
  {
    name: "sync() writes a YAML patch when format is yaml",
    resource: { type: "configmap", name: "app-config" },
    format: "yaml",
    stringOnly: true,
    expected: `data:\n  ${HOST_KEY}: localhost\n  ${PORT_KEY}: "5432"`,
  },
] as const;

for (const testCase of patchCases) {
  nodeTest.test(testCase.name, async () => {
    const dir = await createEnvDir({
      ".env": { [HOST_KEY]: "localhost", [PORT_KEY]: "5432" },
    });

    try {
      const result = await sync.sync({
        resource: testCase.resource,
        cwd: dir,
        format: testCase.format,
        stringOnly: testCase.stringOnly,
        getResourceKeys: fakeResourceKeys([HOST_KEY, PORT_KEY]).lookup,
      });

      assert.assertEquals(result, testCase.expected);
    } finally {
      await runtime.fs.remove(dir, { recursive: true });
    }
  });
}

nodeTest.test(
  "sync() passes the resource reference to getResourceKeys",
  async () => {
    const dir = await createEnvDir({ ".env": { [HOST_KEY]: "localhost" } });
    const keys = fakeResourceKeys([HOST_KEY]);
    const resource = {
      type: "secret",
      name: "app-secret",
      namespace: "test-ns",
    } as const;

    try {
      await sync.sync({ resource, cwd: dir, getResourceKeys: keys.lookup });

      assert.assertEquals(keys.calls, [resource]);
    } finally {
      await runtime.fs.remove(dir, { recursive: true });
    }
  },
);

nodeTest.test(
  "sync() reads the .env file of the environment it is given",
  async () => {
    const dir = await createEnvDir({
      ".env": { [HOST_KEY]: "from-base" },
      ".env.staging": { [HOST_KEY]: "from-staging" },
    });

    try {
      const result = await sync.sync({
        resource: { type: "configmap", name: "app-config" },
        env: "staging",
        cwd: dir,
        stringOnly: true,
        getResourceKeys: fakeResourceKeys([HOST_KEY]).lookup,
      });

      assert.assertEquals(JSON.parse(result), {
        data: { [HOST_KEY]: "from-staging" },
      });
    } finally {
      await runtime.fs.remove(dir, { recursive: true });
    }
  },
);

nodeTest.test(
  "sync() quotes a single quote in a value for the shell",
  async () => {
    const dir = await createEnvDir({ ".env": { [HOST_KEY]: "it's" } });

    try {
      const result = await sync.sync({
        resource: { type: "configmap", name: "app-config" },
        cwd: dir,
        getResourceKeys: fakeResourceKeys([HOST_KEY]).lookup,
      });

      assert.assertEquals(
        result,
        `kubectl patch cm app-config --type=merge -p '{"data":{"${HOST_KEY}":"it'"'"'s"}}'`,
      );
    } finally {
      await runtime.fs.remove(dir, { recursive: true });
    }
  },
);

nodeTest.test("sync() reports a resource with no data keys", async () => {
  const result = await sync.sync({
    resource: { type: "configmap", name: "empty-config" },
    getResourceKeys: fakeResourceKeys([]).lookup,
  });

  assert.assertEquals(result, "# No data found in configmap/empty-config");
});

nodeTest.test(
  "sync() reports a resource whose keys are all missing from the environment",
  async () => {
    const dir = await createEnvDir({ ".env": { [HOST_KEY]: "localhost" } });
    const missing: string[] = [];

    try {
      const result = await sync.sync({
        resource: { type: "secret", name: "app-secret" },
        cwd: dir,
        getResourceKeys: fakeResourceKeys([MISSING_KEY]).lookup,
        onMissingKey: (key) => missing.push(key),
      });

      assert.assertEquals(
        result,
        "# No matching environment variables found for secret/app-secret",
      );
      assert.assertEquals(missing, [MISSING_KEY]);
    } finally {
      await runtime.fs.remove(dir, { recursive: true });
    }
  },
);

nodeTest.test(
  "sync() wraps a failed key lookup and keeps it as the cause",
  async () => {
    const lookupError = new Error("connection refused");

    const error = await assert.assertRejects(
      () =>
        sync.sync({
          resource: { type: "configmap", name: "app-config" },
          getResourceKeys: () => Promise.reject(lookupError),
        }),
      Error,
      "Failed to sync with kubectl: connection refused",
    );

    assert.assertStrictEquals(error.cause, lookupError);
  },
);

nodeTest.test(
  "syncApply() returns the patch command for the injected keys",
  async () => {
    const dir = await createEnvDir({ ".env": { [HOST_KEY]: "localhost" } });

    try {
      const result = await sync.syncApply({
        resource: {
          type: "configmap",
          name: "app-config",
          namespace: "test-ns",
        },
        cwd: dir,
        getResourceKeys: fakeResourceKeys([HOST_KEY]).lookup,
      });

      assert.assertEquals(
        result,
        `kubectl patch cm app-config -n test-ns --type=merge -p '{"data":{"${HOST_KEY}":"localhost"}}'`,
      );
    } finally {
      await runtime.fs.remove(dir, { recursive: true });
    }
  },
);

nodeTest.test(
  "executeKubectl() rejects an invalid name before it runs kubectl",
  async () => {
    await assert.assertRejects(
      () => sync.executeKubectl({ type: "configmap", name: "bad;name" }),
      sync.KubernetesResourceNameError,
    );
  },
);

// Test integration with @eserstack/formats for YAML/JSON output
nodeTest.test(
  "ConfigMap YAML output should be properly formatted",
  async () => {
    const configMap = sync.buildConfigMapFromContext(
      "format-test",
      "test-ns",
      new Map([
        ["APP_NAME", "my-app"],
        ["APP_VERSION", "1.0.0"],
      ]),
    );

    const yamlOutput = await formats.serialize([configMap], "yaml", {
      pretty: true,
    });

    assert.assertStringIncludes(yamlOutput, "apiVersion: v1");
    assert.assertStringIncludes(yamlOutput, "kind: ConfigMap");
    assert.assertStringIncludes(yamlOutput, "name: format-test");
    assert.assertStringIncludes(yamlOutput, "namespace: test-ns");
    assert.assertStringIncludes(yamlOutput, "APP_NAME: my-app");
    assert.assertStringIncludes(yamlOutput, "APP_VERSION: 1.0.0");
  },
);

nodeTest.test("Secret YAML output should be properly formatted", async () => {
  const secret = sync.buildSecretFromContext(
    "secret-format-test",
    "test-ns",
    new Map([
      ["API_KEY", "secret123"],
      ["DB_PASSWORD", "password456"],
    ]),
  );

  const yamlOutput = await formats.serialize([secret], "yaml", {
    pretty: true,
  });

  assert.assertStringIncludes(yamlOutput, "apiVersion: v1");
  assert.assertStringIncludes(yamlOutput, "kind: Secret");
  assert.assertStringIncludes(yamlOutput, "name: secret-format-test");
  assert.assertStringIncludes(yamlOutput, "namespace: test-ns");
  assert.assertStringIncludes(yamlOutput, "type: Opaque");
  // Data should be base64 encoded
  assert.assertStringIncludes(yamlOutput, btoa("secret123"));
  assert.assertStringIncludes(yamlOutput, btoa("password456"));
});

nodeTest.test("JSON output should be valid JSON", async () => {
  const configMap = sync.buildConfigMapFromContext(
    "json-format-test",
    "test-ns",
    new Map([["CONFIG_KEY", "config-value"]]),
  );

  const jsonOutput = await formats.serialize([configMap], "json", {
    pretty: true,
  });

  // Should be parseable as JSON
  const parsed = JSON.parse(jsonOutput);
  assert.assertEquals(Array.isArray(parsed), true);
  assert.assertEquals(parsed[0].apiVersion, "v1");
  assert.assertEquals(parsed[0].kind, "ConfigMap");
  assert.assertEquals(parsed[0].metadata.name, "json-format-test");
  assert.assertEquals(parsed[0].data["CONFIG_KEY"], "config-value");
});

// Test that demonstrates the full workflow
nodeTest.test("Full workflow test with mock data", async () => {
  // Simulate environment values for the test
  const envValues = new Map([
    ["DD_SITE", "datadoghq.com"],
    ["DD_API_KEY", "test-api-key"],
    ["DB_HOST", "localhost"],
  ]);

  // Build ConfigMap
  const configMap = sync.buildConfigMapFromContext(
    "workflow-test",
    "test-ns",
    envValues,
  );

  // Generate YAML output
  const yamlOutput = await formats.serialize([configMap], "yaml", {
    pretty: true,
  });

  // Verify the complete workflow
  assert.assertStringIncludes(yamlOutput, "kind: ConfigMap");
  assert.assertStringIncludes(yamlOutput, "name: workflow-test");
  assert.assertStringIncludes(yamlOutput, "DD_SITE: datadoghq.com");
  assert.assertStringIncludes(yamlOutput, "DD_API_KEY: test-api-key");
  assert.assertStringIncludes(yamlOutput, "DB_HOST: localhost");

  // Test Secret workflow
  const secret = sync.buildSecretFromContext(
    "workflow-secret",
    "test-ns",
    envValues,
  );
  const secretYaml = await formats.serialize([secret], "yaml", {
    pretty: true,
  });

  assert.assertStringIncludes(secretYaml, "kind: Secret");
  assert.assertStringIncludes(secretYaml, "name: workflow-secret");
  assert.assertStringIncludes(secretYaml, "type: Opaque");
  // Verify base64 encoding
  assert.assertStringIncludes(secretYaml, btoa("datadoghq.com"));
  assert.assertStringIncludes(secretYaml, btoa("test-api-key"));
});

// ============================================================================
// Kubernetes Resource Name Validation Tests (Security)
// ============================================================================

nodeTest.test(
  "validateKubernetesResourceName() should accept valid names",
  () => {
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
      sync.validateKubernetesResourceName(name);
    }
  },
);

nodeTest.test(
  "validateKubernetesResourceName() should reject empty names",
  () => {
    assert.assertThrows(
      () => sync.validateKubernetesResourceName(""),
      sync.KubernetesResourceNameError,
      "cannot be empty",
    );
  },
);

nodeTest.test(
  "validateKubernetesResourceName() should reject names exceeding 253 characters",
  () => {
    const longName = "a".repeat(254);
    assert.assertThrows(
      () => sync.validateKubernetesResourceName(longName),
      sync.KubernetesResourceNameError,
      "253 characters or less",
    );
  },
);

nodeTest.test(
  "validateKubernetesResourceName() should reject names with uppercase letters",
  () => {
    assert.assertThrows(
      () => sync.validateKubernetesResourceName("MyApp"),
      sync.KubernetesResourceNameError,
      "lowercase alphanumeric",
    );
  },
);

nodeTest.test(
  "validateKubernetesResourceName() should reject names starting with non-alphanumeric",
  () => {
    const invalidStarts = ["-app", ".app", "_app"];
    for (const name of invalidStarts) {
      assert.assertThrows(
        () => sync.validateKubernetesResourceName(name),
        sync.KubernetesResourceNameError,
      );
    }
  },
);

nodeTest.test(
  "validateKubernetesResourceName() should reject names ending with non-alphanumeric",
  () => {
    const invalidEnds = ["app-", "app.", "app_"];
    for (const name of invalidEnds) {
      assert.assertThrows(
        () => sync.validateKubernetesResourceName(name),
        sync.KubernetesResourceNameError,
      );
    }
  },
);

nodeTest.test(
  "validateKubernetesResourceName() should reject names with shell metacharacters",
  () => {
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
      assert.assertThrows(
        () => sync.validateKubernetesResourceName(name),
        sync.KubernetesResourceNameError,
      );
    }
  },
);

nodeTest.test(
  "validateKubernetesResourceName() should reject names with consecutive dots or dashes",
  () => {
    assert.assertThrows(
      () => sync.validateKubernetesResourceName("app..name"),
      sync.KubernetesResourceNameError,
      "consecutive dots or dashes",
    );

    assert.assertThrows(
      () => sync.validateKubernetesResourceName("app--name"),
      sync.KubernetesResourceNameError,
      "consecutive dots or dashes",
    );
  },
);

nodeTest.test(
  "validateKubernetesResourceName() should use custom field name in error messages",
  () => {
    try {
      sync.validateKubernetesResourceName("", "namespace");
      assert.assert(false, "Should have thrown");
    } catch (error) {
      assert.assertStringIncludes((error as Error).message, "namespace");
    }
  },
);

nodeTest.test(
  "validateResourceReference() should validate both name and namespace",
  () => {
    // Valid reference
    sync.validateResourceReference({
      type: "configmap",
      name: "my-config",
      namespace: "my-namespace",
    });

    // Valid reference without namespace
    sync.validateResourceReference({
      type: "secret",
      name: "my-secret",
    });
  },
);

nodeTest.test(
  "validateResourceReference() should reject invalid resource names",
  () => {
    assert.assertThrows(
      () =>
        sync.validateResourceReference({
          type: "configmap",
          name: "Invalid-Name",
          namespace: "default",
        }),
      sync.KubernetesResourceNameError,
    );
  },
);

nodeTest.test(
  "validateResourceReference() should reject invalid namespace",
  () => {
    assert.assertThrows(
      () =>
        sync.validateResourceReference({
          type: "configmap",
          name: "my-config",
          namespace: "Invalid-Namespace",
        }),
      sync.KubernetesResourceNameError,
    );
  },
);

nodeTest.test(
  "sync() should reject invalid resource names before the key lookup",
  async () => {
    const keys = fakeResourceKeys([HOST_KEY]);

    await assert.assertRejects(
      () =>
        sync.sync({
          resource: { type: "configmap", name: "invalid;name" },
          getResourceKeys: keys.lookup,
        }),
      sync.KubernetesResourceNameError,
    );
    assert.assertEquals(keys.calls, []);
  },
);

nodeTest.test(
  "sync() should reject invalid namespace before the key lookup",
  async () => {
    const keys = fakeResourceKeys([HOST_KEY]);

    await assert.assertRejects(
      () =>
        sync.sync({
          resource: {
            type: "configmap",
            name: "valid-name",
            namespace: "invalid|namespace",
          },
          getResourceKeys: keys.lookup,
        }),
      sync.KubernetesResourceNameError,
    );
    assert.assertEquals(keys.calls, []);
  },
);
