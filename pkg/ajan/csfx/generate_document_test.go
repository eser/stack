// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package csfx_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/csfx"
)

// A generated YAML manifest is one document that kubectl can apply, not a
// sequence holding the resource.
func TestGenerateYAMLIsOneDocument(t *testing.T) {
	t.Parallel()

	dir := t.TempDir()
	envFile := filepath.Join(dir, ".env")

	if err := os.WriteFile(envFile, []byte("A=1\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	out, err := csfx.Generate(csfx.GenerateOptions{ //nolint:exhaustruct
		Resource: csfx.ResourceReference{Type: csfx.ResourceTypeConfigMap, Name: "app"}, //nolint:exhaustruct
		EnvFile:  envFile,
		Format:   "yaml",
	})
	if err != nil {
		t.Fatal(err)
	}

	if !strings.HasPrefix(out, "apiVersion: v1\nkind: ConfigMap\n") {
		t.Errorf("not one document:\n%s", out)
	}
}
