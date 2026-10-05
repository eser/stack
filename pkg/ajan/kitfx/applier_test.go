// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package kitfx_test

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/kitfx"
	"github.com/eser/stack/pkg/ajan/logfx"
)

const postInstallFailureLog = "post-install command failed"

// newBufferLogger returns a logfx logger that writes to the returned buffer.
// ApplyRecipe logs on the calling goroutine, so the buffer is safe to read
// once ApplyRecipe returns.
func newBufferLogger() (*logfx.Logger, *bytes.Buffer) {
	var logs bytes.Buffer

	return logfx.NewLogger(logfx.WithWriter(&logs)), &logs
}

// requirePrograms skips the test when a program the commands run is missing.
func requirePrograms(t *testing.T, programs ...string) {
	t.Helper()

	for _, program := range programs {
		if _, err := exec.LookPath(program); err != nil {
			t.Skipf("%s is not on PATH: %v", program, err)
		}
	}
}

// TestApplyRecipe_PostInstallFailures pins the handling of a failed
// post-install command: it does not stop the recipe, the next command still
// runs, the command is listed in PostInstallFailed, and the cause is logged
// once through the logfx logger. The "never exits" case shows the per-command
// bound: `sleep 60` ends at PostInstallTimeout instead of holding the caller
// for a minute.
func TestApplyRecipe_PostInstallFailures(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		commands   []string
		programs   []string
		timeout    time.Duration
		wantFailed []string
		wantCause  string
	}{
		{
			name:       "command not found",
			commands:   []string{"nonexistent-postinstall-cmd-4567", "go version"},
			programs:   []string{"go"},
			timeout:    0,
			wantFailed: []string{"nonexistent-postinstall-cmd-4567"},
			wantCause:  "executable file not found",
		},
		{
			name:       "command never exits",
			commands:   []string{"sleep 60", "go version"},
			programs:   []string{"sleep", "go"},
			timeout:    200 * time.Millisecond,
			wantFailed: []string{"sleep 60"},
			wantCause:  "no exit within 200ms",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			requirePrograms(t, tc.programs...)

			logger, logs := newBufferLogger()
			recipe := &kitfx.Recipe{Name: "post", PostInstall: tc.commands}

			start := time.Now()
			result, err := kitfx.ApplyRecipe(t.Context(), recipe, kitfx.ApplyOptions{
				CWD:                t.TempDir(),
				Logger:             logger,
				PostInstallTimeout: tc.timeout,
			})
			elapsed := time.Since(start)

			if err != nil {
				t.Fatalf("ApplyRecipe returned %v; a failed post-install command must not fail the recipe", err)
			}

			if elapsed > 20*time.Second {
				t.Errorf("ApplyRecipe took %v; the post-install timeout did not bound the command", elapsed)
			}

			if !slices.Equal(result.PostInstallRan, tc.commands) {
				t.Errorf("PostInstallRan = %v, want %v", result.PostInstallRan, tc.commands)
			}

			if !slices.Equal(result.PostInstallFailed, tc.wantFailed) {
				t.Errorf("PostInstallFailed = %v, want %v", result.PostInstallFailed, tc.wantFailed)
			}

			if got := strings.Count(logs.String(), postInstallFailureLog); got != 1 {
				t.Errorf("logged %d post-install failures, want 1; logs: %s", got, logs.String())
			}

			if !strings.Contains(logs.String(), tc.wantCause) {
				t.Errorf("logs do not contain %q; logs: %s", tc.wantCause, logs.String())
			}
		})
	}
}

// TestApplyRecipe_CallerDeadlineDuringPostInstall checks that a caller giving
// up while a command runs ends the phase with an error instead of being
// reported as a failure of the command.
func TestApplyRecipe_CallerDeadlineDuringPostInstall(t *testing.T) {
	t.Parallel()
	requirePrograms(t, "sleep")

	logger, logs := newBufferLogger()
	recipe := &kitfx.Recipe{Name: "post", PostInstall: []string{"sleep 60", "sleep 0"}}

	ctx, cancel := context.WithTimeout(t.Context(), 200*time.Millisecond)
	defer cancel()

	result, err := kitfx.ApplyRecipe(ctx, recipe, kitfx.ApplyOptions{CWD: t.TempDir(), Logger: logger})
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected an error wrapping context.DeadlineExceeded, got %v", err)
	}

	if !strings.Contains(err.Error(), "after 0 of 2 commands") {
		t.Errorf("expected the error to say how far post-install got, got %v", err)
	}

	if len(result.PostInstallFailed) != 0 {
		t.Errorf("PostInstallFailed = %v, want none: the caller ended the phase", result.PostInstallFailed)
	}

	if strings.Contains(logs.String(), postInstallFailureLog) {
		t.Errorf("a caller deadline was logged as a command failure; logs: %s", logs.String())
	}
}

func TestApplyRecipe_NegativePostInstallTimeoutWritesNothing(t *testing.T) {
	t.Parallel()

	srcFile := filepath.Join(t.TempDir(), "src.txt")
	if err := os.WriteFile(srcFile, []byte("content"), 0o600); err != nil {
		t.Fatal(err)
	}

	cwd := t.TempDir()
	recipe := &kitfx.Recipe{
		Name:        "post",
		Files:       []kitfx.RecipeFile{{Source: srcFile, Target: "out.txt", Provider: kitfx.RecipeFileProviderLocal}},
		PostInstall: []string{"go version"},
	}

	_, err := kitfx.ApplyRecipe(t.Context(), recipe, kitfx.ApplyOptions{CWD: cwd, PostInstallTimeout: -time.Second})
	if err == nil || !strings.Contains(err.Error(), "post-install timeout -1s is negative") {
		t.Fatalf("expected an error naming the negative timeout, got %v", err)
	}

	if _, statErr := os.Stat(filepath.Join(cwd, "out.txt")); !errors.Is(statErr, os.ErrNotExist) {
		t.Errorf("out.txt was written despite the rejected options (stat: %v)", statErr)
	}
}

// TestInstallDependencies_CallerDeadlineBoundsEachCommand shows that a hanging
// install command ends with the caller's context, and that the remaining
// instructions still get a result.
func TestInstallDependencies_CallerDeadlineBoundsEachCommand(t *testing.T) {
	t.Parallel()
	requirePrograms(t, "sleep")

	ctx, cancel := context.WithTimeout(t.Context(), 200*time.Millisecond)
	defer cancel()

	start := time.Now()
	results := kitfx.InstallDependencies(ctx, []string{"sleep 60", "sleep 0"}, t.TempDir())
	elapsed := time.Since(start)

	if elapsed > 20*time.Second {
		t.Errorf("InstallDependencies took %v; the caller's deadline did not bound the command", elapsed)
	}

	if len(results) != 2 {
		t.Fatalf("got %d results, want 2", len(results))
	}

	for _, result := range results {
		if result.Success {
			t.Errorf("%q succeeded after the caller's deadline", result.Command)
		}
	}
}
