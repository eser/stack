// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"regexp"
	"slices"
	"syscall"
)

const (
	exitOK      = 0
	exitFailure = 1

	// guardVar marks the environment of the npx process, so a stub that npx
	// resolves back to (a package whose bin finds this binary on PATH) stops
	// instead of forwarding to itself forever.
	guardVar = "ESER_LEGACY_FORWARDER"
)

var semverPattern = regexp.MustCompile(`^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$`) //nolint:gochecknoglobals

// forwarder is one stub process: what it is called, where it runs and the
// environment it passes on.
type forwarder struct {
	name       string
	version    string
	executable string
	stdin      io.Reader
	stdout     io.Writer
	stderr     io.Writer
	environ    []string
	lookPath   func(file string) (string, error)
}

// run answers `version` and `update` (also as `system version` and
// `system update`, the v4.5.x long forms, and `--version`, which the
// Homebrew formula's test runs), and forwards everything else to the npm
// package. It returns the exit code.
func (f *forwarder) run(ctx context.Context, args []string) int {
	if f.name == "" {
		_, _ = fmt.Fprintln(f.stderr, "This forwarding stub was built without a name; "+
			`build it with -ldflags "-X main.name=<tool>".`)

		return exitFailure
	}

	command := args
	if len(command) > 0 && command[0] == "system" {
		command = command[1:]
	}

	if len(command) > 0 {
		switch command[0] {
		case "version", "--version":
			f.printVersion()

			return exitOK
		case "update":
			f.printUpdate()

			return exitOK
		}
	}

	if slices.Contains(f.environ, guardVar+"="+f.name) {
		_, _ = fmt.Fprintf(f.stderr, "%s: npx ran this forwarding stub again instead of the npm package.\n"+
			"Install the package directly:\n  npm i -g %s\n", f.name, f.name)

		return exitFailure
	}

	npx, err := f.lookPath("npx")
	if err != nil {
		_, _ = fmt.Fprintf(f.stderr, "%s is distributed on npm now, and this binary runs it through npx, "+
			"which is not on PATH.\nInstall Node.js, which includes npx, or install %s with npm:\n  npm i -g %s\n",
			f.name, f.name, f.name)

		return exitFailure
	}

	return f.forward(ctx, npx, args)
}

// packageSpec is <name>@<version>, or the bare name for a build without a
// release version, which npx resolves to the latest release.
func (f *forwarder) packageSpec() string {
	if semverPattern.MatchString(f.version) {
		return f.name + "@" + f.version
	}

	return f.name
}

func (f *forwarder) printVersion() {
	_, _ = fmt.Fprintf(f.stdout, "%s %s\nThis binary is a forwarding stub; it runs npx --yes %s.\n",
		f.name, f.version, f.packageSpec())
}

func (f *forwarder) printUpdate() {
	_, _ = fmt.Fprintf(f.stdout, "%s is distributed on npm now. This binary is a forwarding stub that runs "+
		"npx --yes %s,\nso it has no newer binary to update to. Install the npm package instead:\n"+
		"  npm i -g %s\nand then delete this binary: %s\n", f.name, f.packageSpec(), f.name, f.executable)
}

// forward runs npx --yes <spec> <args> with this process's stdio and
// returns its exit code. Ctrl-C reaches npx from the terminal on its own,
// so the stub ignores it and waits; a SIGTERM sent to the stub alone is
// passed on.
func (f *forwarder) forward(ctx context.Context, npx string, args []string) int {
	cmd := exec.CommandContext(ctx, npx, append([]string{"--yes", f.packageSpec()}, args...)...) //nolint:gosec // G204: npx from PATH with the user's arguments, as the stub's purpose
	cmd.Stdin = f.stdin
	cmd.Stdout = f.stdout
	cmd.Stderr = f.stderr
	cmd.Env = append(slices.Clone(f.environ), guardVar+"="+f.name)

	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)

	defer signal.Stop(signals)

	if err := cmd.Start(); err != nil {
		_, _ = fmt.Fprintf(f.stderr, "%s: start %s: %v\n", f.name, npx, err)

		return exitFailure
	}

	done := make(chan struct{})
	defer close(done)

	go func() {
		for {
			select {
			case sig := <-signals:
				if sig != os.Interrupt {
					_ = cmd.Process.Signal(sig)
				}
			case <-done:
				return
			}
		}
	}()

	err := cmd.Wait()

	if exitErr, ok := errors.AsType[*exec.ExitError](err); ok {
		if code := exitErr.ExitCode(); code >= 0 {
			return code
		}

		return exitFailure // ended by a signal
	}

	if err != nil {
		_, _ = fmt.Fprintf(f.stderr, "%s: run %s: %v\n", f.name, npx, err)

		return exitFailure
	}

	return exitOK
}
