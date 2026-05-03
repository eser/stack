// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package processfx

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"time"
)

// ExecOptions configures a shell command execution.
type ExecOptions struct {
	// Args are additional arguments appended after the command string.
	// If the command already embeds all arguments (e.g. "ls -la"), leave this nil.
	Args []string

	// Env contains additional KEY=VALUE pairs merged into the subprocess environment.
	// If nil, the subprocess inherits the parent process environment.
	Env []string

	// Cwd sets the working directory. Defaults to the current directory when empty.
	Cwd string

	// Stdin is optional input piped to the subprocess's stdin.
	Stdin []byte

	// Timeout limits the execution duration. Zero means no limit.
	Timeout time.Duration
}

// ExecResult holds the outcome of a completed command execution.
type ExecResult struct {
	// Stdout is the captured standard output of the subprocess.
	Stdout string

	// Stderr is the captured standard error of the subprocess.
	Stderr string

	// Code is the exit code. 0 means success.
	Code int
}

// Exec runs the given command string (passed to /bin/sh -c) and returns its
// combined stdout, stderr, and exit code. The call blocks until the process
// exits or the context is cancelled.
//
// A non-zero exit code is not treated as an error — the caller can inspect
// ExecResult.Code. An actual error (spawn failure, timeout, context cancel)
// is returned as the second value.
func Exec(ctx context.Context, command string, opts ExecOptions) (ExecResult, error) {
	if opts.Timeout > 0 {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, opts.Timeout)
		defer cancel()
	}

	// Build the argument list: ["sh", "-c", command, <extra args...>]
	args := append([]string{"-c", command}, opts.Args...) //nolint:gocritic
	cmd := exec.CommandContext(ctx, "sh", args...)

	if opts.Cwd != "" {
		cmd.Dir = opts.Cwd
	}

	if opts.Stdin != nil {
		cmd.Stdin = bytes.NewReader(opts.Stdin)
	}

	var stdoutBuf, stderrBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf
	cmd.Stderr = &stderrBuf

	if len(opts.Env) > 0 {
		// Inherit parent environment and overlay with provided vars.
		cmd.Env = append(cmd.Environ(), opts.Env...)
	}

	runErr := cmd.Run()

	result := ExecResult{
		Stdout: stdoutBuf.String(),
		Stderr: stderrBuf.String(),
		Code:   0,
	}

	if runErr != nil {
		// Context timeout or cancellation takes priority over exit code.
		if ctxErr := ctx.Err(); ctxErr != nil {
			return result, fmt.Errorf("exec %q: %w", command, ctxErr)
		}

		var exitErr *exec.ExitError
		if ok := isExitError(runErr, &exitErr); ok {
			result.Code = exitErr.ExitCode()

			return result, nil
		}

		return result, fmt.Errorf("exec %q: %w", command, runErr)
	}

	return result, nil
}

// isExitError checks if err is an *exec.ExitError and populates target.
func isExitError(err error, target **exec.ExitError) bool {
	if ee, ok := err.(*exec.ExitError); ok { //nolint:errorlint
		*target = ee

		return true
	}

	return false
}
