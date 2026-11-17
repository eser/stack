// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// `--write-baseline` records the current violations of
// validate-code-conventions, as `node validate-code-conventions.ts
// --write-baseline` did before the TypeScript CLI was removed (TASK-255).
func TestValidateCodeConventionsWritesTheBaseline(t *testing.T) {
	t.Parallel()

	e := testEnv(t)
	if err := os.WriteFile(filepath.Join(e.cwd, "a.ts"), []byte("export * from \"./b.ts\";\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	out, stderr, code := runCLI(t, e, "codebase", "validate-code-conventions", "--write-baseline", "--no-manifest")
	if code != 0 || !strings.Contains(out, "1 violation") {
		t.Fatalf("exit %d\n%s%s", code, out, stderr)
	}

	baseline, err := os.ReadFile(filepath.Join(e.cwd, ".eser", "baselines", "code-conventions.json"))
	if err != nil || !strings.Contains(string(baseline), `"a.ts": 1`) {
		t.Errorf("baseline: %v\n%s", err, baseline)
	}

	if _, _, code := runCLI(t, e, "codebase", "validate-code-conventions", "--no-manifest"); code != 0 {
		t.Errorf("the validator fails on the violations its baseline records: exit %d", code)
	}
}
