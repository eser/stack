// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// The commands this binary does not implement yet run in the TypeScript
// noskills CLI, found in this order:
//
//  1. NOSKILLS_TS_CLI, a command line split on whitespace (no shell), such
//     as `node /path/to/pkg/@eserstack/noskills/main.ts`;
//  2. a `noskills` bin in a directory of ESER_PLUGIN_PATH, which the eser
//     npm launcher sets to the Node noskills package (decision-10), unless
//     it is this binary;
//  3. `npx --yes noskills@<version>` when npx is on PATH.
//
// NOSKILLS_NO_FORWARD=1 turns forwarding off, so a test can prove that a
// command ran in Go. The forwarded CLI gets NOSKILLS_CLI_PREFIX set to the
// command that runs this binary: `noskills init` then writes it into the
// manifest, and every hook and wrapper generated from that manifest calls
// the Go binary instead of `npx eser@latest noskills`.

const (
	envTSCLI     = "NOSKILLS_TS_CLI"
	envNoForward = "NOSKILLS_NO_FORWARD"
	envCLIPrefix = "NOSKILLS_CLI_PREFIX"
	envPlugin    = "ESER_PLUGIN_PATH"
	npmPackage   = "noskills"
)

var semverPattern = regexp.MustCompile(`^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$`) //nolint:gochecknoglobals // compiled once

// tsCLI is how the TypeScript CLI runs: a program and its leading
// arguments, or a message when none is found.
type tsCLI struct {
	program string
	args    []string
	message string
}

// sameFile reports whether two paths name one file.
func sameFile(a, b string) bool {
	left, err := os.Stat(a)
	if err != nil {
		return false
	}

	right, err := os.Stat(b)
	if err != nil {
		return false
	}

	return os.SameFile(left, right)
}

func isExecutable(path string) bool {
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() {
		return false
	}

	return filepath.Ext(path) != "" || info.Mode().Perm()&0o111 != 0
}

func resolveTSCLI(e *env) tsCLI {
	if e.getenv(envNoForward) == "1" {
		return tsCLI{program: "", args: nil, message: envNoForward + " is set, so the TypeScript noskills CLI is not run."}
	}

	self, _ := e.executable()

	if words := strings.Fields(e.getenv(envTSCLI)); len(words) > 0 {
		return tsCLI{program: words[0], args: words[1:], message: ""}
	}

	for _, dir := range filepath.SplitList(e.getenv(envPlugin)) {
		if dir == "" {
			continue
		}

		candidates := []string{filepath.Join(dir, "noskills")}
		if e.goos == "windows" {
			candidates = []string{filepath.Join(dir, "noskills.cmd"), filepath.Join(dir, "noskills.exe"), candidates[0]}
		}

		for _, candidate := range candidates {
			if isExecutable(candidate) && (self == "" || !sameFile(candidate, self)) {
				return tsCLI{program: candidate, args: nil, message: ""}
			}
		}
	}

	spec := npmPackage
	if semverPattern.MatchString(e.version) {
		spec += "@" + e.version
	}

	if npx, err := e.lookPath("npx"); err == nil {
		return tsCLI{program: npx, args: []string{"--yes", spec}, message: ""}
	}

	return tsCLI{
		program: "",
		args:    nil,
		message: "This command runs in the TypeScript noskills CLI, and none was found: install Node.js so npx " +
			"can run " + spec + ", or set " + envTSCLI + " to the command that runs it.",
	}
}

// selfCommand is how a shell runs this binary: `noskills` when that name on
// PATH is this file, otherwise its absolute path, quoted when it needs it.
func selfCommand(e *env) string {
	self, err := e.executable()
	if err != nil {
		return ""
	}

	if onPath, err := e.lookPath("noskills"); err == nil && sameFile(onPath, self) {
		return "noskills"
	}

	if resolved, err := filepath.EvalSymlinks(self); err == nil {
		self = resolved
	}

	if strings.ContainsAny(self, " \t\n'\"\\$`&|;<>()*?[]#~!{}") {
		return noskillsfx.ShellQuote(self)
	}

	return self
}

// forwardEnviron is the environment the TypeScript CLI gets: this one, plus
// NOSKILLS_CLI_PREFIX naming this binary unless the user set it.
func forwardEnviron(e *env) []string {
	environ := e.environ()

	if _, set := e.lookupEnv(envCLIPrefix); set {
		return environ
	}

	if prefix := selfCommand(e); prefix != "" {
		environ = append(environ, envCLIPrefix+"="+prefix)
	}

	return environ
}

// forward runs `noskills <args>` in the TypeScript CLI and returns its exit
// code.
func forward(ctx context.Context, e *env, args []string) int {
	cli := resolveTSCLI(e)
	if cli.program == "" {
		_, _ = fmt.Fprintln(e.stderr, "noskills: "+cli.message)

		return clifx.ExitFailure
	}

	code, err := e.runProcess(ctx, e, cli.program, append(cli.args, args...), forwardEnviron(e), e.cwd)
	if err != nil {
		_, _ = fmt.Fprintf(e.stderr, "noskills: %v\n", err)

		return clifx.ExitFailure
	}

	return code
}
