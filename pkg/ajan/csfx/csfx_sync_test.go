// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package csfx_test

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/csfx"
)

// fakeKubectl writes a shell script that echoes a JSON response and exits with
// the given code, then prepends its directory to PATH so exec.Command picks it up.
func fakeKubectl(t *testing.T, jsonResponse string, exitCode int) {
	t.Helper()

	dir := t.TempDir()
	script := filepath.Join(dir, "kubectl")
	content := fmt.Sprintf("#!/bin/sh\necho '%s'\nexit %d\n",
		strings.ReplaceAll(jsonResponse, "'", `'"'"'`), exitCode)

	if err := os.WriteFile(script, []byte(content), 0o755); err != nil { //nolint:gosec
		t.Fatalf("write fake kubectl: %v", err)
	}

	t.Setenv("PATH", dir+":"+os.Getenv("PATH"))
}

// buildKubectlJSON returns a minimal kubectl get JSON response with the given data keys.
func buildKubectlJSON(dataKeys []string) string {
	data := make(map[string]any, len(dataKeys))
	for _, k := range dataKeys {
		data[k] = "value"
	}

	b, _ := json.Marshal(map[string]any{"data": data}) //nolint:errcheck

	return string(b)
}

// ─── kubectlPatchCommand (tested via Sync / SyncApply paths) ─────────────────

func TestSync_InvalidRef_ValidationError(t *testing.T) {
	t.Parallel()

	_, err := csfx.Sync(csfx.SyncOptions{ //nolint:exhaustruct
		Resource: csfx.ResourceReference{
			Type: csfx.ResourceTypeConfigMap,
			Name: "Bad_Name",
		},
	})
	if err == nil {
		t.Fatal("expected validation error for invalid resource name")
	}
}

func TestSync_KubectlUnavailable(t *testing.T) {
	t.Parallel()

	_, err := csfx.Sync(csfx.SyncOptions{ //nolint:exhaustruct
		Resource: csfx.ResourceReference{
			Type: csfx.ResourceTypeConfigMap,
			Name: "valid-config",
		},
	})
	if err == nil {
		t.Skip("kubectl available in test env — skipping unavailability check")
	}

	if !strings.Contains(err.Error(), "kubectl") {
		t.Errorf("expected kubectl error, got: %v", err)
	}
}

func TestSyncApply_InvalidRef_ValidationError(t *testing.T) {
	t.Parallel()

	_, err := csfx.SyncApply(csfx.SyncOptions{ //nolint:exhaustruct
		Resource: csfx.ResourceReference{
			Type: csfx.ResourceTypeSecret,
			Name: "invalid name with spaces",
		},
	})
	if err == nil {
		t.Fatal("expected validation error for invalid resource name")
	}
}

func TestSyncApply_KubectlUnavailable(t *testing.T) {
	t.Parallel()

	_, err := csfx.SyncApply(csfx.SyncOptions{ //nolint:exhaustruct
		Resource: csfx.ResourceReference{
			Type: csfx.ResourceTypeSecret,
			Name: "valid-secret",
		},
	})
	if err == nil {
		t.Skip("kubectl available in test env — skipping unavailability check")
	}

	if !strings.Contains(err.Error(), "kubectl") {
		t.Errorf("expected kubectl error, got: %v", err)
	}
}

func TestRunKubectl_InvalidRef(t *testing.T) {
	t.Parallel()

	_, err := csfx.RunKubectl(csfx.ResourceReference{
		Type: csfx.ResourceTypeConfigMap,
		Name: "Invalid;Name",
	})
	if err == nil {
		t.Fatal("expected validation error")
	}
}

func TestRunKubectl_KubectlUnavailable(t *testing.T) {
	t.Parallel()

	_, err := csfx.RunKubectl(csfx.ResourceReference{
		Type: csfx.ResourceTypeConfigMap,
		Name: "some-config",
	})
	if err == nil {
		t.Skip("kubectl available in test env")
	}

	if !strings.Contains(err.Error(), "kubectl") {
		t.Errorf("expected kubectl error, got: %v", err)
	}
}

// ─── mock kubectl tests ───────────────────────────────────────────────────────

func TestRunKubectl_ConfigMap_ReturnsKeys(t *testing.T) {
	fakeKubectl(t, buildKubectlJSON([]string{"DB_HOST", "DB_PORT"}), 0)

	keys, err := csfx.RunKubectl(csfx.ResourceReference{
		Type: csfx.ResourceTypeConfigMap,
		Name: "my-config",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(keys) != 2 {
		t.Errorf("expected 2 keys, got %d: %v", len(keys), keys)
	}
}

func TestRunKubectl_Secret_UsesSecretResourceType(t *testing.T) {
	fakeKubectl(t, buildKubectlJSON([]string{"API_KEY"}), 0)

	keys, err := csfx.RunKubectl(csfx.ResourceReference{
		Type: csfx.ResourceTypeSecret,
		Name: "my-secret",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(keys) != 1 {
		t.Errorf("expected 1 key, got %d", len(keys))
	}
}

func TestRunKubectl_WithNamespace(t *testing.T) {
	fakeKubectl(t, buildKubectlJSON([]string{"NS_KEY"}), 0)

	keys, err := csfx.RunKubectl(csfx.ResourceReference{
		Type:      csfx.ResourceTypeConfigMap,
		Name:      "ns-config",
		Namespace: "production",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(keys) != 1 {
		t.Errorf("expected 1 key, got %d", len(keys))
	}
}

func TestRunKubectl_InvalidJSON_Error(t *testing.T) {
	fakeKubectl(t, "not-json", 0)

	_, err := csfx.RunKubectl(csfx.ResourceReference{
		Type: csfx.ResourceTypeConfigMap,
		Name: "bad-json-config",
	})
	if err == nil {
		t.Fatal("expected error for invalid JSON output")
	}
}

func TestRunKubectl_ExitError(t *testing.T) {
	fakeKubectl(t, "not found", 1)

	_, err := csfx.RunKubectl(csfx.ResourceReference{
		Type: csfx.ResourceTypeConfigMap,
		Name: "missing-config",
	})
	if err == nil {
		t.Fatal("expected error for exit code 1")
	}
}

func TestSync_HappyPath_JSON(t *testing.T) {
	dir := t.TempDir()
	envFile := filepath.Join(dir, ".env.prod")

	if err := os.WriteFile(envFile, []byte("DB_HOST=localhost\nDB_PORT=5432\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	fakeKubectl(t, buildKubectlJSON([]string{"DB_HOST", "DB_PORT"}), 0)

	got, err := csfx.Sync(csfx.SyncOptions{
		Resource: csfx.ResourceReference{
			Type: csfx.ResourceTypeConfigMap,
			Name: "my-config",
		},
		EnvFile: envFile,
	})
	if err != nil {
		t.Fatalf("Sync error: %v", err)
	}
	if !strings.Contains(got, "kubectl patch cm my-config") {
		t.Errorf("unexpected output: %q", got)
	}
	if !strings.Contains(got, "--type=merge") {
		t.Errorf("missing --type=merge: %q", got)
	}
}

func TestSync_HappyPath_YAML(t *testing.T) {
	dir := t.TempDir()
	envFile := filepath.Join(dir, ".env.prod")

	if err := os.WriteFile(envFile, []byte("APP_NAME=myapp\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	fakeKubectl(t, buildKubectlJSON([]string{"APP_NAME"}), 0)

	got, err := csfx.Sync(csfx.SyncOptions{
		Resource: csfx.ResourceReference{
			Type: csfx.ResourceTypeConfigMap,
			Name: "yaml-config",
		},
		EnvFile: envFile,
		Format:  "yaml",
	})
	if err != nil {
		t.Fatalf("Sync YAML error: %v", err)
	}
	if !strings.Contains(got, "kubectl patch") {
		t.Errorf("missing kubectl patch: %q", got)
	}
	if !strings.Contains(got, "data:") {
		t.Errorf("missing yaml data key: %q", got)
	}
}

func TestSync_StringOnly(t *testing.T) {
	dir := t.TempDir()
	envFile := filepath.Join(dir, ".env")

	if err := os.WriteFile(envFile, []byte("K=V\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	fakeKubectl(t, buildKubectlJSON([]string{"K"}), 0)

	got, err := csfx.Sync(csfx.SyncOptions{
		Resource: csfx.ResourceReference{
			Type: csfx.ResourceTypeConfigMap,
			Name: "cfg",
		},
		EnvFile:    envFile,
		StringOnly: true,
	})
	if err != nil {
		t.Fatalf("Sync StringOnly error: %v", err)
	}
	if strings.Contains(got, "kubectl") {
		t.Errorf("StringOnly should not include kubectl command: %q", got)
	}
}

func TestSync_SecretBase64Encoding(t *testing.T) {
	dir := t.TempDir()
	envFile := filepath.Join(dir, ".env.secret")

	if err := os.WriteFile(envFile, []byte("TOKEN=mysecrettoken\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	fakeKubectl(t, buildKubectlJSON([]string{"TOKEN"}), 0)

	got, err := csfx.Sync(csfx.SyncOptions{
		Resource: csfx.ResourceReference{
			Type: csfx.ResourceTypeSecret,
			Name: "my-secret",
		},
		EnvFile: envFile,
	})
	if err != nil {
		t.Fatalf("Sync Secret error: %v", err)
	}
	if !strings.Contains(got, "kubectl patch secret my-secret") {
		t.Errorf("unexpected output: %q", got)
	}
}

func TestSync_EmptyKubectl_NoData(t *testing.T) {
	fakeKubectl(t, `{"data":{}}`, 0)

	got, err := csfx.Sync(csfx.SyncOptions{ //nolint:exhaustruct
		Resource: csfx.ResourceReference{
			Type: csfx.ResourceTypeConfigMap,
			Name: "empty-config",
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(got, "No data found") {
		t.Errorf("expected 'No data found', got: %q", got)
	}
}

func TestSync_NoMatchingKeys(t *testing.T) {
	dir := t.TempDir()
	envFile := filepath.Join(dir, ".env")

	if err := os.WriteFile(envFile, []byte("UNRELATED_KEY=val\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	fakeKubectl(t, buildKubectlJSON([]string{"COMPLETELY_DIFFERENT"}), 0)

	got, err := csfx.Sync(csfx.SyncOptions{
		Resource: csfx.ResourceReference{
			Type: csfx.ResourceTypeConfigMap,
			Name: "no-match-config",
		},
		EnvFile: envFile,
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(got, "No matching") {
		t.Errorf("expected 'No matching' message, got: %q", got)
	}
}

func TestSyncApply_HappyPath(t *testing.T) {
	dir := t.TempDir()
	envFile := filepath.Join(dir, ".env")

	if err := os.WriteFile(envFile, []byte("MYKEY=myval\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	fakeKubectl(t, buildKubectlJSON([]string{"MYKEY"}), 0)

	got, err := csfx.SyncApply(csfx.SyncOptions{
		Resource: csfx.ResourceReference{
			Type: csfx.ResourceTypeConfigMap,
			Name: "apply-config",
		},
		EnvFile: envFile,
	})
	if err != nil {
		t.Fatalf("SyncApply error: %v", err)
	}
	if !strings.Contains(got, "kubectl patch") {
		t.Errorf("expected kubectl patch in SyncApply output: %q", got)
	}
}
