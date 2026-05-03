// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package processfx_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/processfx"
)

func TestExec_SimpleCommand(t *testing.T) {
	t.Parallel()

	result, err := processfx.Exec(context.Background(), "echo hello", processfx.ExecOptions{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(result.Stdout, "hello") {
		t.Fatalf("expected stdout to contain 'hello', got %q", result.Stdout)
	}

	if result.Code != 0 {
		t.Fatalf("expected exit code 0, got %d", result.Code)
	}
}

func TestExec_NonZeroExitCode(t *testing.T) {
	t.Parallel()

	result, err := processfx.Exec(context.Background(), "exit 42", processfx.ExecOptions{})
	if err != nil {
		t.Fatalf("unexpected error (non-zero exit should not return error): %v", err)
	}

	if result.Code != 42 {
		t.Fatalf("expected exit code 42, got %d", result.Code)
	}
}

func TestExec_Stderr(t *testing.T) {
	t.Parallel()

	result, err := processfx.Exec(context.Background(), "echo err >&2", processfx.ExecOptions{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(result.Stderr, "err") {
		t.Fatalf("expected stderr to contain 'err', got %q", result.Stderr)
	}
}

func TestExec_Stdin(t *testing.T) {
	t.Parallel()

	result, err := processfx.Exec(context.Background(), "cat", processfx.ExecOptions{
		Stdin: []byte("hello from stdin"),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(result.Stdout, "hello from stdin") {
		t.Fatalf("expected stdout to echo stdin, got %q", result.Stdout)
	}
}

func TestExec_Cwd(t *testing.T) {
	t.Parallel()

	result, err := processfx.Exec(context.Background(), "pwd", processfx.ExecOptions{
		Cwd: "/tmp",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(result.Stdout, "tmp") {
		t.Fatalf("expected stdout to contain 'tmp', got %q", result.Stdout)
	}
}

func TestExec_EnvVar(t *testing.T) {
	t.Parallel()

	result, err := processfx.Exec(context.Background(), "echo $MY_VAR", processfx.ExecOptions{
		Env: []string{"MY_VAR=testvalue"},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(result.Stdout, "testvalue") {
		t.Fatalf("expected stdout to contain env var value, got %q", result.Stdout)
	}
}

func TestExec_Timeout(t *testing.T) {
	t.Parallel()

	_, err := processfx.Exec(context.Background(), "sleep 10", processfx.ExecOptions{
		Timeout: 100 * time.Millisecond,
	})
	if err == nil {
		t.Fatal("expected timeout error, got nil")
	}
}
