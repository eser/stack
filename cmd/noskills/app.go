// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os/exec"
	"slices"
	"time"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/noskillsfx"
)

// env is everything the CLI reads from or does to the outside world, so
// tests run it against buffers, temp dirs and fake programs.
type env struct {
	stdin  io.Reader
	stdout io.Writer
	stderr io.Writer

	getenv     func(key string) string
	lookupEnv  func(key string) (string, bool)
	environ    func() []string
	lookPath   func(file string) (string, error)
	executable func() (string, error)

	cwd     string
	goos    string
	version string

	now         func() time.Time
	randomToken func() (string, error)
	isAlive     func(pid int) bool
	runGit      noskillsfx.GitRunner

	// runShell runs a verification command line.
	runShell noskillsfx.ShellRunner
	// rawInput puts a terminal stdin in raw mode for a prompt and returns
	// what restores it; it does nothing for other input.
	rawInput func() (restore func())
	// ollamaReachable reports whether a local Ollama answers.
	ollamaReachable func(ctx context.Context) bool
	// exit ends the process, as a prompt's Ctrl+C does.
	exit func(code int)

	// runProcess runs a program with the CLI's stdio and the given
	// environment, and returns its exit code.
	runProcess func(ctx context.Context, e *env, name string, args, environ []string, dir string) (int, error)

	// agent is what `noskills run` drives; nil means the real process
	// (systemRunPorts).
	agent *runPorts

	// validators are the aifx providers `next --validate` can name; nil
	// means the real ones (systemValidatorFactories).
	validators validatorFactories
}

// runInheritingStdio runs a program attached to the CLI's own streams.
func runInheritingStdio(ctx context.Context, e *env, name string, args, environ []string, dir string) (int, error) {
	cmd := exec.CommandContext(ctx, name, args...) //nolint:gosec // G204: the resolved TypeScript noskills CLI
	cmd.Stdin = e.stdin
	cmd.Stdout = e.stdout
	cmd.Stderr = e.stderr
	cmd.Env = environ
	cmd.Dir = dir

	err := cmd.Run()

	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return exitErr.ExitCode(), nil
	}

	if err != nil {
		return clifx.ExitFailure, fmt.Errorf("run %s: %w", name, err)
	}

	return clifx.ExitOK, nil
}

// runGitBinary runs git with no stdin and stderr, as the TypeScript
// checks run it. ok is false when git exits with an error; err is set
// when it cannot start or ctx ends first.
func runGitBinary(ctx context.Context, git string, args []string, dir string) (string, bool, error) {
	cmd := exec.CommandContext(ctx, git, args...) //nolint:gosec // G204: the real git binary with git's own arguments
	cmd.Dir = dir

	var stdout bytes.Buffer

	cmd.Stdout = &stdout

	err := cmd.Run()
	if ctxErr := ctx.Err(); ctxErr != nil {
		return "", false, fmt.Errorf("git did not answer: %w", ctxErr)
	}

	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return "", false, nil
	}

	if err != nil {
		return "", false, fmt.Errorf("start %s: %w", git, err)
	}

	return stdout.String(), true, nil
}

// tsCommand is a command of the TypeScript CLI (module.ts), listed so help
// and completions show it; the Go CLI forwards it.
type tsCommand struct {
	name  string
	short string
}

func tsCommands() []tsCommand {
	return []tsCommand{
		{"init", "Initialize noskills in project"},
		{"status", "Show current state"},
		{"spec", "Manage specs (new, list)"},
		{"validate", "Read-only completeness check for a spec (CI-friendly)"},
		{"ledger", "Read-only decision ledger + maturity summary for a spec"},
		{"next", "Get next instruction for agent"},
		{"approve", "Approve phase transition"},
		{"block", "Mark spec as blocked"},
		{"reset", "Reset current spec state"},
		{"done", "Mark spec execution as complete"},
		{"free", "Show idle mode info (noskills starts permissive by default)"},
		{"cancel", "Cancel current spec"},
		{"wontfix", "Mark spec as won't fix (requires reason)"},
		{"reopen", "Reopen a completed spec for revision"},
		{"concern", "Manage concerns (add, remove, list)"},
		{"run", "Autonomous execution loop (Ralph loop)"},
		{"watch", "Live dashboard for monitoring agent progress"},
		{"web", "Start web interface (browser dashboard)"},
		{"sync", "Regenerate tool-specific files (redirects to init)"},
		{"learn", "Manage cross-session learnings (list, remove)"},
		{"diagrams", "Diagram registry and staleness checks (scan, list, check, verify)"},
		{"purge", "Remove all noskills content (specs, rules, concerns, hooks)"},
		{"rule", "Manage rules (add, list, promote)"},
		{"config", "Manage configuration (set-user, get-user, clear-user)"},
		{"pack", "Manage packs (list, install, uninstall, inspect, search)"},
		{"session", "Manage sessions for multi-instance support"},
		{"manager", "Multi-spec TUI with tab management"},
		{"mgr", "Alias for manager"},
	}
}

// nativeCommands are the words the Go CLI answers itself; any other first
// word goes to the TypeScript CLI.
func nativeCommands() []string {
	return []string{"invoke-hook", "version", "help", "completion", "__complete"}
}

func newApp(e *env) *clifx.App {
	commands := make([]*clifx.Command, 0, 2+len(tsCommands()))
	commands = append(commands,
		&clifx.Command{ //nolint:exhaustruct
			Name:    "invoke-hook",
			Short:   "Internal hook handlers (called by agents)",
			Long:    "Runs one agent hook: pre-tool-use, stop, post-file-write, post-bash, session-start, post-ask-user-question, or git-exec <git arguments>. The hooks read the tool's JSON on stdin.",
			Args:    "<event> [arguments]",
			RawArgs: true,
			Run:     func(c *clifx.Context) error { return invokeHook(c, e) },
		},
		&clifx.Command{ //nolint:exhaustruct
			Name:  "version",
			Short: "Print the noskills version",
			Run: func(c *clifx.Context) error {
				return c.Output(map[string]string{"version": e.version, "runtime": "go"}, func(w io.Writer) error {
					_, err := fmt.Fprintln(w, "noskills", e.version)

					return err
				})
			},
		},
	)

	for _, ts := range tsCommands() {
		name := ts.name
		commands = append(commands, &clifx.Command{ //nolint:exhaustruct
			Name:    name,
			Short:   ts.short,
			RawArgs: true,
			Run: func(c *clifx.Context) error {
				return exitWith(forward(c.Context, e, append([]string{name}, c.Args...)))
			},
		})
	}

	return &clifx.App{
		Name:    "noskills",
		Version: e.version,
		Stdin:   e.stdin,
		Stdout:  e.stdout,
		Stderr:  e.stderr,
		Root: &clifx.Command{ //nolint:exhaustruct
			Long: "noskills is a state-machine orchestrator for AI agents. This Go build runs the agent hooks " +
				"itself and forwards the other commands to the TypeScript noskills CLI until they are ported.",
			Subcommands: commands,
		},
	}
}

// exitWith turns an exit code into what a clifx Run returns.
func exitWith(code int) error {
	if code == clifx.ExitOK {
		return nil
	}

	return &clifx.ExitError{Err: nil, Code: code}
}

// isRootFlag reports whether an argument is one clifx answers at the root.
func isRootFlag(arg string) bool {
	return slices.Contains([]string{"--help", "-h", "-help", "--version", "-V"}, arg)
}

// run dispatches one invocation: the native commands, help and --version
// through clifx; any other first word, a known TypeScript command or not,
// goes to the TypeScript CLI with the arguments as given, so its own
// parsing and error messages apply.
func run(ctx context.Context, e *env, args []string) int {
	if len(args) > 0 && slices.Contains(lifecycleCommands(), args[0]) {
		return runLifecycle(ctx, e, args)
	}

	if len(args) > 0 && slices.Contains(stateCommands(), args[0]) {
		return runStateCommand(ctx, e, args)
	}

	if len(args) > 0 && slices.Contains(sessionCommands(), args[0]) {
		return runSessionCommand(ctx, e, args)
	}

	if len(args) > 0 && args[0] == "run" {
		return runAgentLoop(ctx, e, args[1:])
	}

	if len(args) > 0 && !slices.Contains(nativeCommands(), args[0]) && !isRootFlag(args[0]) {
		return forward(ctx, e, args)
	}

	return newApp(e).Run(ctx, args)
}
