// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package workflowfx_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"testing"
)

// initLine matches the inittrace line of the jsonschema package, for example
// "init github.com/santhosh-tekuri/jsonschema/v6 @1.2 ms, 0.004 ms clock, ...".
var initLine = regexp.MustCompile(`init github\.com/santhosh-tekuri/jsonschema/v6 @[0-9.]+ ms, ([0-9.]+) ms clock`)

// TestJsonschemaInitIsLazy checks the in-tree fork (third-party/jsonschema,
// decision-56): linking the package must not compile the metaschemas, which
// upstream does in init() for about 1.3 ms natively.
func TestJsonschemaInitIsLazy(t *testing.T) {
	t.Parallel()

	if testing.Short() {
		t.Skip("builds and runs a helper program")
	}

	bin := filepath.Join(t.TempDir(), "inittrace")

	build := exec.CommandContext(t.Context(), "go", "build", "-o", bin, "./testdata/inittrace")
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build the helper: %v\n%s", err, out)
	}

	run := exec.CommandContext(t.Context(), bin)
	run.Env = append(os.Environ(), "GODEBUG=inittrace=1")

	out, err := run.CombinedOutput()
	if err != nil {
		t.Fatalf("run the helper: %v\n%s", err, out)
	}

	match := initLine.FindSubmatch(out)
	if match == nil {
		// A package without init work prints no inittrace line at all.
		return
	}

	clockMs, err := strconv.ParseFloat(string(match[1]), 64)
	if err != nil {
		t.Fatalf("parse %q: %v", match[1], err)
	}

	if clockMs >= 0.1 {
		t.Errorf("jsonschema init took %.3f ms, want under 0.1 ms; is the replace to third-party/jsonschema in go.mod?", clockMs)
	}
}
