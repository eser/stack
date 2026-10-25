// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// noskills is the Go build of the noskills CLI (TASK-257, decision-25). It
// runs the agent hooks itself (`noskills invoke-hook <event>`, the git
// wrapper's check and the hook command generation in noskillsfx), so a hook
// starts in milliseconds and never waits on a package registry. Every other
// command goes to the TypeScript noskills CLI until it is ported (TASK-258,
// TASK-259, TASK-260).
//
// Usage:
//
//	noskills invoke-hook <event> [arguments]
//	noskills <command> [arguments]
//	noskills --help
package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"golang.org/x/term"
)

// version is set at build time: -ldflags "-X main.version=$(cat VERSION)".
var version = "dev" //nolint:gochecknoglobals // set by the linker

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	code := run(ctx, newSystemEnv(), os.Args[1:])

	stop()
	os.Exit(code)
}

// newSystemEnv is the environment of the real process.
func newSystemEnv() *env {
	cwd, err := os.Getwd()
	if err != nil {
		cwd = "."
	}

	e := &env{
		stdin:       os.Stdin,
		stdout:      os.Stdout,
		stderr:      os.Stderr,
		getenv:      os.Getenv,
		lookupEnv:   os.LookupEnv,
		environ:     os.Environ,
		lookPath:    exec.LookPath,
		executable:  os.Executable,
		cwd:         cwd,
		goos:        runtime.GOOS,
		version:     version,
		now:         time.Now,
		randomToken: randomToken,
		isAlive:     isProcessAlive,
		runGit:      runGitBinary,
		runProcess:  runInheritingStdio,
	}
	e.runShell = func(ctx context.Context, command, dir string) (string, string, bool, error) {
		return runShell(ctx, e, command, dir)
	}
	e.rawInput = rawStdin
	e.ollamaReachable = ollamaReachable
	e.exit = os.Exit

	return e
}

// rawStdin puts a terminal stdin in raw mode, so a prompt reads each key.
func rawStdin() func() {
	fd := int(os.Stdin.Fd()) //nolint:gosec // G115: a file descriptor fits an int
	if !term.IsTerminal(fd) {
		return func() {}
	}

	state, err := term.MakeRaw(fd)
	if err != nil {
		return func() {}
	}

	return func() { _ = term.Restore(fd, state) }
}

// ollamaReachable is checkOllamaReachable: GET /api/version on the local
// Ollama port, given a second.
func ollamaReachable(ctx context.Context) bool {
	ctx, cancel := context.WithTimeout(ctx, time.Second)
	defer cancel()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://localhost:11434/api/version", nil)
	if err != nil {
		return false
	}

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return false
	}

	_ = response.Body.Close()

	return response.StatusCode >= 200 && response.StatusCode < 300
}

// randomToken is an ask token id: 8 hex characters from a CSPRNG, as
// `crypto.randomUUID().slice(0, 8)` gives the TypeScript hook.
func randomToken() (string, error) {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err //nolint:wrapcheck // the caller names the operation
	}

	return hex.EncodeToString(b[:]), nil
}
