// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package csfx

import (
	"strings"
	"testing"
)

// ─── kubectlPatchCommand ──────────────────────────────────────────────────────

func TestKubectlPatchCommand_ConfigMap(t *testing.T) {
	t.Parallel()

	got := kubectlPatchCommand(
		ResourceReference{Type: ResourceTypeConfigMap, Name: "my-config"},
		`{"data":{"KEY":"val"}}`,
	)

	if !strings.HasPrefix(got, "kubectl patch cm my-config") {
		t.Errorf("unexpected prefix: %q", got)
	}
	if !strings.Contains(got, "--type=merge") {
		t.Errorf("missing --type=merge: %q", got)
	}
	if !strings.Contains(got, `{"data":{"KEY":"val"}}`) {
		t.Errorf("missing patch data: %q", got)
	}
}

func TestKubectlPatchCommand_SecretWithNamespace(t *testing.T) {
	t.Parallel()

	got := kubectlPatchCommand(
		ResourceReference{Type: ResourceTypeSecret, Name: "my-secret", Namespace: "prod"},
		`{"data":{"TOKEN":"abc"}}`,
	)

	if !strings.Contains(got, "kubectl patch secret my-secret") {
		t.Errorf("unexpected prefix: %q", got)
	}
	if !strings.Contains(got, "-n prod") {
		t.Errorf("missing namespace: %q", got)
	}
}

func TestKubectlPatchCommand_SingleQuoteEscape(t *testing.T) {
	t.Parallel()

	got := kubectlPatchCommand(
		ResourceReference{Type: ResourceTypeConfigMap, Name: "cfg"},
		`{"data":{"K":"val'quote"}}`,
	)

	// POSIX shell escape: each ' becomes '"'"'
	if !strings.Contains(got, `'"'"'`) {
		t.Errorf("expected POSIX single-quote escape '\"'\"' in output: %q", got)
	}
}

func TestKubectlPatchCommand_NoNamespace(t *testing.T) {
	t.Parallel()

	got := kubectlPatchCommand(
		ResourceReference{Type: ResourceTypeConfigMap, Name: "cfg"},
		`{}`,
	)

	if strings.Contains(got, " -n ") {
		t.Errorf("unexpected -n flag when no namespace: %q", got)
	}
}
