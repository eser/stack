// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// eser is the Go build of the eser CLI (M3-T4). It runs the manifest scripts
// of .eser/manifest.yml as `eser <script>`, installs, updates and diagnoses
// itself, and forwards every other command to a plugin: `eser-<name>` on
// PATH, a known bin (laroux, noskills, eser-posts), or `npx --yes`.
//
// Usage:
//
//	eser <command> [arguments]
//	eser --help
package main

import (
	"context"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"
	"time"
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

	return &env{
		stdin:      os.Stdin,
		stdout:     os.Stdout,
		stderr:     os.Stderr,
		getenv:     os.Getenv,
		environ:    os.Environ,
		lookPath:   exec.LookPath,
		executable: os.Executable,
		homeDir:    os.UserHomeDir,
		cwd:        cwd,
		goos:       runtime.GOOS,
		goarch:     runtime.GOARCH,
		version:    version,
		httpClient: &http.Client{Timeout: 5 * time.Minute}, //nolint:exhaustruct
		releases:   defaultReleases(),
		runProcess: runInheritingStdio,
	}
}
