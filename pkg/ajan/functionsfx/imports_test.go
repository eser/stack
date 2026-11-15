// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package functionsfx_test

import (
	"os/exec"
	"strings"
	"testing"
)

// The core of functionsfx imports no framework: the adapters that bind it to
// httpfx, clifx, workerfx and aifx live in functionsfx/triggers, so a service
// pulls in only the ones it uses (ADR 0011).
func TestTheCoreImportsNoFramework(t *testing.T) {
	t.Parallel()

	goTool, err := exec.LookPath("go")
	if err != nil {
		t.Skip("the go tool is not on the PATH")
	}

	out, err := exec.CommandContext(t.Context(), goTool, "list", "-deps", "-f", "{{.ImportPath}}", ".").Output() //nolint:gosec // G204: the go tool, with fixed arguments
	if err != nil {
		t.Fatalf("go list -deps: %v", err)
	}

	for _, framework := range []string{
		"/pkg/ajan/httpfx",
		"/pkg/ajan/clifx",
		"/pkg/ajan/workerfx",
		"/pkg/ajan/aifx",
		"/pkg/ajan/functionsfx/triggers",
	} {
		for _, imported := range strings.Fields(string(out)) {
			if strings.Contains(imported, framework) {
				t.Errorf("the core of functionsfx depends on %s", imported)
			}
		}
	}
}
