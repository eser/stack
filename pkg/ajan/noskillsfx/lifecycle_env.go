// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"time"
)

// LifecycleEnv is what the lifecycle commands read from or do to the world
// besides the project's files, so a test runs them against fakes. The CLI,
// noskills-server and the FFI bridge each fill it in.
type LifecycleEnv struct {
	// Root is the project root, the directory that holds .eser/.
	Root string
	// Cwd is the process directory; git runs there to name the user.
	Cwd string
	// LookupEnv reads an environment variable.
	LookupEnv func(key string) (string, bool)
	// Now is the clock.
	Now func() time.Time
	// RunGit runs git; nil skips the git identity lookup.
	RunGit GitRunner
	// RunShell runs a verification command line; nil fails the check.
	RunShell ShellRunner
	// Warn is told about a state file that exists but cannot be read.
	Warn StateWarner
	// Notice gets the one-line notices the TypeScript CLI writes to stderr.
	Notice func(text string)
}

// ShellRunner runs a command line through the platform shell in dir and
// returns its stdout, stderr and whether it exited 0. err is set when the
// shell could not start; ctx ends a command that runs too long.
type ShellRunner func(ctx context.Context, command, dir string) (stdout, stderr string, ok bool, err error)

func (e *LifecycleEnv) getenv(key string) (string, bool) {
	if e.LookupEnv == nil {
		return "", false
	}

	return e.LookupEnv(key)
}

func (e *LifecycleEnv) now() time.Time {
	if e.Now == nil {
		return time.Now()
	}

	return e.Now()
}

func (e *LifecycleEnv) nowISO() string {
	return ISOTime(e.now())
}

func (e *LifecycleEnv) notice(text string) {
	if e.Notice != nil {
		e.Notice(text)
	}
}

// ResolveUser is resolveUser: the user.json identity, else git's
// user.name and user.email in Cwd, else UnknownUser (identity.go).
func (e *LifecycleEnv) ResolveUser(ctx context.Context) User {
	return ResolveUserWith(ctx, e.LookupEnv, e.RunGit, e.Cwd)
}

// appendEvent adds a line to .eser/.state/events/events.jsonl. The line is
// one write to the log opened for appending, so concurrent appends, from this
// process or another, each keep their line; reading the log and writing it
// back would drop the lines appended in between.
func appendEvent(root string, event *JSObject) error {
	dir := filepath.Join(root, eventsDir)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return err //nolint:wrapcheck // the caller names the operation
	}

	file, err := os.OpenFile(filepath.Join(root, eventsFile), os.O_APPEND|os.O_CREATE|os.O_WRONLY, stateFilePerm) //nolint:gosec // G302, G304: the events log of the project, not secret
	if err != nil {
		return err //nolint:wrapcheck // the caller names the operation
	}

	_, writeErr := file.Write([]byte(jsonStringify(event) + "\n"))

	return errors.Join(writeErr, file.Close()) //nolint:wrapcheck // the caller names the operation
}
