// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package processfx_test

import (
	"context"
	"testing"

	"github.com/eser/stack/pkg/ajan/processfx"
)

func TestExec_NonExistentCwd(t *testing.T) {
	t.Parallel()

	// A non-existent Cwd produces *os.PathError from chdir, not *exec.ExitError.
	// This covers the isExitError false branch in exec.go.
	_, err := processfx.Exec(context.Background(), "echo hi", processfx.ExecOptions{
		Cwd: "/nonexistent_path_xyz_abc_123456",
	})

	if err == nil {
		t.Fatal("expected error for non-existent working directory, got nil")
	}
}
