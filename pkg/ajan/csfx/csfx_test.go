// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package csfx_test

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/csfx"
)

// ---------------------------------------------------------------------------
// ValidateResourceName
// ---------------------------------------------------------------------------

func TestValidateResourceName(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		input     string
		wantErr   bool
		errTarget error
	}{
		{name: "valid simple", input: "my-config", wantErr: false},
		{name: "valid with dot", input: "my.config", wantErr: false},
		{name: "valid single char", input: "a", wantErr: false},
		{name: "valid numbers", input: "config-v2", wantErr: false},
		{name: "empty string", input: "", wantErr: true, errTarget: csfx.ErrResourceNameRequired},
		{
			name:      "too long",
			input:     strings.Repeat("a", 254),
			wantErr:   true,
			errTarget: csfx.ErrResourceNameTooLong,
		},
		{
			name:      "uppercase letters",
			input:     "MyConfig",
			wantErr:   true,
			errTarget: csfx.ErrResourceNameInvalid,
		},
		{
			name:      "starts with dash",
			input:     "-config",
			wantErr:   true,
			errTarget: csfx.ErrResourceNameInvalid,
		},
		{
			name:      "ends with dash",
			input:     "config-",
			wantErr:   true,
			errTarget: csfx.ErrResourceNameInvalid,
		},
		{
			name:      "consecutive dots",
			input:     "my..config",
			wantErr:   true,
			errTarget: csfx.ErrConsecutiveSeparators,
		},
		{
			name:      "consecutive dashes",
			input:     "my--config",
			wantErr:   true,
			errTarget: csfx.ErrConsecutiveSeparators,
		},
		{
			name:      "underscore not allowed",
			input:     "my_config",
			wantErr:   true,
			errTarget: csfx.ErrResourceNameInvalid,
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			err := csfx.ValidateResourceName(tc.input, "resource name")
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}

				if tc.errTarget != nil && !strings.Contains(err.Error(), tc.errTarget.Error()) {
					t.Errorf("error %q does not mention %q", err, tc.errTarget)
				}
			} else if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// ValidateResourceReference
// ---------------------------------------------------------------------------

func TestValidateResourceReference(t *testing.T) {
	t.Parallel()

	t.Run("valid without namespace", func(t *testing.T) {
		t.Parallel()

		err := csfx.ValidateResourceReference(csfx.ResourceReference{
			Type: csfx.ResourceTypeConfigMap,
			Name: "my-config",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("valid with namespace", func(t *testing.T) {
		t.Parallel()

		err := csfx.ValidateResourceReference(csfx.ResourceReference{
			Type:      csfx.ResourceTypeConfigMap,
			Name:      "my-config",
			Namespace: "production",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("invalid name propagates", func(t *testing.T) {
		t.Parallel()

		err := csfx.ValidateResourceReference(csfx.ResourceReference{
			Type: csfx.ResourceTypeConfigMap,
			Name: "UPPERCASE",
		})
		if err == nil {
			t.Fatal("expected error for invalid name, got nil")
		}
	})

	t.Run("invalid namespace propagates", func(t *testing.T) {
		t.Parallel()

		err := csfx.ValidateResourceReference(csfx.ResourceReference{
			Type:      csfx.ResourceTypeConfigMap,
			Name:      "my-config",
			Namespace: "Invalid_NS",
		})
		if err == nil {
			t.Fatal("expected error for invalid namespace, got nil")
		}
	})
}

// ---------------------------------------------------------------------------
// BuildConfigMap
// ---------------------------------------------------------------------------

func TestBuildConfigMap(t *testing.T) {
	t.Parallel()

	t.Run("basic construction", func(t *testing.T) {
		t.Parallel()

		cm := csfx.BuildConfigMap("my-config", "", map[string]string{
			"KEY": "value",
		})

		if cm.APIVersion != "v1" {
			t.Errorf("APIVersion = %q, want %q", cm.APIVersion, "v1")
		}

		if cm.Kind != "ConfigMap" {
			t.Errorf("Kind = %q, want %q", cm.Kind, "ConfigMap")
		}

		if cm.Metadata.Name != "my-config" {
			t.Errorf("Name = %q, want %q", cm.Metadata.Name, "my-config")
		}

		if cm.Metadata.Namespace != "" {
			t.Errorf("Namespace = %q, want empty", cm.Metadata.Namespace)
		}

		if cm.Data["KEY"] != "value" {
			t.Errorf("Data[KEY] = %q, want %q", cm.Data["KEY"], "value")
		}
	})

	t.Run("namespace omitted when default", func(t *testing.T) {
		t.Parallel()

		cm := csfx.BuildConfigMap("cfg", "default", map[string]string{})
		if cm.Metadata.Namespace != "" {
			t.Errorf("expected empty namespace for 'default', got %q", cm.Metadata.Namespace)
		}
	})

	t.Run("non-default namespace preserved", func(t *testing.T) {
		t.Parallel()

		cm := csfx.BuildConfigMap("cfg", "production", map[string]string{})
		if cm.Metadata.Namespace != "production" {
			t.Errorf("Namespace = %q, want %q", cm.Metadata.Namespace, "production")
		}
	})
}

// ---------------------------------------------------------------------------
// BuildSecret
// ---------------------------------------------------------------------------

func TestBuildSecret(t *testing.T) {
	t.Parallel()

	t.Run("values are base64 encoded", func(t *testing.T) {
		t.Parallel()

		secret := csfx.BuildSecret("my-secret", "", map[string]string{
			"PASSWORD": "hunter2",
			"TOKEN":    "abc123",
		})

		if secret.Kind != "Secret" {
			t.Errorf("Kind = %q, want Secret", secret.Kind)
		}

		if secret.Type != "Opaque" {
			t.Errorf("Type = %q, want Opaque", secret.Type)
		}

		wantPassword := base64.StdEncoding.EncodeToString([]byte("hunter2"))
		if secret.Data["PASSWORD"] != wantPassword {
			t.Errorf("Data[PASSWORD] = %q, want %q", secret.Data["PASSWORD"], wantPassword)
		}

		wantToken := base64.StdEncoding.EncodeToString([]byte("abc123"))
		if secret.Data["TOKEN"] != wantToken {
			t.Errorf("Data[TOKEN] = %q, want %q", secret.Data["TOKEN"], wantToken)
		}
	})

	t.Run("empty data produces empty data field", func(t *testing.T) {
		t.Parallel()

		secret := csfx.BuildSecret("empty", "", map[string]string{})
		if len(secret.Data) != 0 {
			t.Errorf("expected empty Data, got %v", secret.Data)
		}
	})
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

func TestGenerate(t *testing.T) {
	t.Parallel()

	writeEnv := func(t *testing.T, content string) string {
		t.Helper()

		tmp := t.TempDir()
		path := filepath.Join(tmp, ".env")

		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatalf("write env file: %v", err)
		}

		return path
	}

	t.Run("YAML ConfigMap output", func(t *testing.T) {
		t.Parallel()

		envFile := writeEnv(t, "DB_HOST=localhost\nDB_PORT=5432\n")

		result, err := csfx.Generate(csfx.GenerateOptions{
			Resource: csfx.ResourceReference{
				Type: csfx.ResourceTypeConfigMap,
				Name: "my-config",
			},
			EnvFile: envFile,
			Format:  "yaml",
		})
		if err != nil {
			t.Fatalf("Generate: %v", err)
		}

		if !strings.Contains(result, "ConfigMap") {
			t.Errorf("expected ConfigMap in output, got:\n%s", result)
		}

		if !strings.Contains(result, "my-config") {
			t.Errorf("expected resource name in output, got:\n%s", result)
		}

		if !strings.Contains(result, "DB_HOST") {
			t.Errorf("expected DB_HOST in output, got:\n%s", result)
		}
	})

	t.Run("JSON Secret output with base64 data", func(t *testing.T) {
		t.Parallel()

		envFile := writeEnv(t, "API_KEY=secret123\n")

		result, err := csfx.Generate(csfx.GenerateOptions{
			Resource: csfx.ResourceReference{
				Type: csfx.ResourceTypeSecret,
				Name: "api-keys",
			},
			EnvFile: envFile,
			Format:  "json",
		})
		if err != nil {
			t.Fatalf("Generate: %v", err)
		}

		if !strings.Contains(result, "Secret") {
			t.Errorf("expected Secret in output, got:\n%s", result)
		}

		// Value must be base64-encoded, not the original string.
		if strings.Contains(result, "secret123") {
			t.Errorf("plaintext value must not appear in Secret data")
		}

		wantEncoded := base64.StdEncoding.EncodeToString([]byte("secret123"))
		if !strings.Contains(result, wantEncoded) {
			t.Errorf("expected base64 value %q in output", wantEncoded)
		}
	})

	t.Run("JSON output is a valid array", func(t *testing.T) {
		t.Parallel()

		envFile := writeEnv(t, "APP_NAME=myapp\nAPP_PORT=8080\n")

		result, err := csfx.Generate(csfx.GenerateOptions{
			Resource: csfx.ResourceReference{
				Type:      csfx.ResourceTypeConfigMap,
				Name:      "array-test",
				Namespace: "default",
			},
			EnvFile: envFile,
			Format:  "json",
		})
		if err != nil {
			t.Fatalf("Generate: %v", err)
		}

		var arr []any
		if err := json.Unmarshal([]byte(result), &arr); err != nil {
			t.Fatalf("JSON output is not a valid array: %v\noutput:\n%s", err, result)
		}

		if len(arr) != 1 {
			t.Fatalf("expected array length 1, got %d", len(arr))
		}

		obj, ok := arr[0].(map[string]any)
		if !ok {
			t.Fatalf("array[0] is not an object")
		}

		if obj["kind"] != "ConfigMap" {
			t.Errorf("kind = %q, want ConfigMap", obj["kind"])
		}

		meta, _ := obj["metadata"].(map[string]any)
		if meta["name"] != "array-test" {
			t.Errorf("metadata.name = %q, want array-test", meta["name"])
		}
	})

	t.Run("empty env file returns comment", func(t *testing.T) {
		t.Parallel()

		envFile := writeEnv(t, "")

		result, err := csfx.Generate(csfx.GenerateOptions{
			Resource: csfx.ResourceReference{
				Type: csfx.ResourceTypeConfigMap,
				Name: "empty-config",
			},
			EnvFile: envFile,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if !strings.HasPrefix(result, "#") {
			t.Errorf("expected comment string, got: %q", result)
		}
	})

	t.Run("non-default namespace included in metadata", func(t *testing.T) {
		t.Parallel()

		envFile := writeEnv(t, "KEY=val\n")

		result, err := csfx.Generate(csfx.GenerateOptions{
			Resource: csfx.ResourceReference{
				Type:      csfx.ResourceTypeConfigMap,
				Name:      "ns-config",
				Namespace: "staging",
			},
			EnvFile: envFile,
			Format:  "yaml",
		})
		if err != nil {
			t.Fatalf("Generate: %v", err)
		}

		if !strings.Contains(result, "staging") {
			t.Errorf("expected namespace 'staging' in output, got:\n%s", result)
		}
	})
}

func TestGenerate_EnvFiles(t *testing.T) {
	t.Parallel()

	writeEnvAt := func(t *testing.T, dir, name, content string) {
		t.Helper()
		path := filepath.Join(dir, name)
		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatalf("write env file %s: %v", name, err)
		}
	}

	t.Run("no env files returns comment", func(t *testing.T) {
		t.Parallel()

		result, err := csfx.Generate(csfx.GenerateOptions{
			Resource: csfx.ResourceReference{
				Type: csfx.ResourceTypeConfigMap,
				Name: "no-env",
			},
			EnvFiles: []string{},
			Format:   "yaml",
		})
		if err != nil {
			t.Fatalf("Generate: %v", err)
		}

		if !strings.HasPrefix(result, "#") {
			t.Errorf("expected comment string for empty EnvFiles, got: %q", result)
		}
	})

	t.Run(".env only", func(t *testing.T) {
		t.Parallel()

		tmp := t.TempDir()
		writeEnvAt(t, tmp, ".env", "BASE_KEY=base_val\n")

		result, err := csfx.Generate(csfx.GenerateOptions{
			Resource: csfx.ResourceReference{
				Type: csfx.ResourceTypeConfigMap,
				Name: "env-only",
			},
			EnvFiles: []string{filepath.Join(tmp, ".env"), filepath.Join(tmp, ".env.local")},
			Format:   "yaml",
		})
		if err != nil {
			t.Fatalf("Generate: %v", err)
		}

		if !strings.Contains(result, "BASE_KEY") {
			t.Errorf("expected BASE_KEY in output, got:\n%s", result)
		}
	})

	t.Run(".env.local only", func(t *testing.T) {
		t.Parallel()

		tmp := t.TempDir()
		writeEnvAt(t, tmp, ".env.local", "LOCAL_KEY=local_val\n")

		result, err := csfx.Generate(csfx.GenerateOptions{
			Resource: csfx.ResourceReference{
				Type: csfx.ResourceTypeConfigMap,
				Name: "local-only",
			},
			EnvFiles: []string{filepath.Join(tmp, ".env"), filepath.Join(tmp, ".env.local")},
			Format:   "yaml",
		})
		if err != nil {
			t.Fatalf("Generate: %v", err)
		}

		if !strings.Contains(result, "LOCAL_KEY") {
			t.Errorf("expected LOCAL_KEY in output, got:\n%s", result)
		}
	})

	t.Run(".env and .env.local merged, local overrides", func(t *testing.T) {
		t.Parallel()

		tmp := t.TempDir()
		writeEnvAt(t, tmp, ".env", "SHARED=base\nBASE_ONLY=present\n")
		writeEnvAt(t, tmp, ".env.local", "SHARED=override\nLOCAL_ONLY=present\n")

		result, err := csfx.Generate(csfx.GenerateOptions{
			Resource: csfx.ResourceReference{
				Type: csfx.ResourceTypeConfigMap,
				Name: "merged-env",
			},
			EnvFiles: []string{filepath.Join(tmp, ".env"), filepath.Join(tmp, ".env.local")},
			Format:   "yaml",
		})
		if err != nil {
			t.Fatalf("Generate: %v", err)
		}

		if !strings.Contains(result, "override") {
			t.Errorf("expected overridden SHARED value 'override' in output, got:\n%s", result)
		}

		if !strings.Contains(result, "BASE_ONLY") {
			t.Errorf("expected BASE_ONLY in output, got:\n%s", result)
		}

		if !strings.Contains(result, "LOCAL_ONLY") {
			t.Errorf("expected LOCAL_ONLY in output, got:\n%s", result)
		}
	})
}
