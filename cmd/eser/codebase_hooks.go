// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"bytes"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/eser/stack/pkg/ajan/clifx"
)

// `eser codebase install`, `uninstall` and `status` manage the git hooks of
// the manifest's workflow events (M3-T7). The hooks run the Go eser:
// `go run ./cmd/eser` inside eser/stack, `eser` anywhere else, or the
// command --command names.

// hookMarker marks a hook this command wrote; the TypeScript
// `eser codebase install` writes the same marker, so each one updates and
// removes the other's hooks.
const hookMarker = "# @eser managed hook"

// devEserCommand runs the eser of an eser/stack checkout.
const devEserCommand = "go run ./cmd/eser"

// gitHooksTimeout bounds the git call that finds the hooks directory.
const gitHooksTimeout = 30 * time.Second

var errNotGitRepo = errors.New("not inside a git repository")

// gitHook maps a manifest event to a git hook and the arguments git passes it.
type gitHook struct {
	event string
	name  string
	args  string
}

// gitHooks are the events a hook can run, in install order.
var gitHooks = []gitHook{ //nolint:gochecknoglobals // a fixed table
	{event: "precommit", name: "pre-commit", args: ""},
	{event: "commitmsg", name: "commit-msg", args: ` -- "$1"`},
	{event: "prepush", name: "pre-push", args: ""},
}

// hookScript is the content of a managed hook that runs the event's
// workflows with command.
func hookScript(command string, hook gitHook) string {
	return strings.Join([]string{
		"#!/bin/sh",
		hookMarker + ", written by `eser codebase install`.",
		"# Do not edit; run `eser codebase install` again to update it.",
		"",
		command + " workflows run -e " + hook.event + hook.args,
		"",
	}, "\n")
}

// hookCommand returns the command the hooks run: devEserCommand in an
// eser/stack checkout (its go.mod and cmd/eser), otherwise eser on PATH.
func hookCommand(root string) string {
	goMod, err := os.ReadFile(filepath.Join(root, "go.mod")) //nolint:gosec // G304: the repository's go.mod
	if err != nil || !fileExists(filepath.Join(root, "cmd", "eser", "main.go")) {
		return "eser"
	}

	for line := range strings.SplitSeq(string(goMod), "\n") {
		if strings.TrimSpace(line) == "module github.com/eser/stack" {
			return devEserCommand
		}
	}

	return "eser"
}

// hookEvents returns the hooks for the events the manifest's workflows run on.
func hookEvents(root string) ([]gitHook, []string, error) {
	config, err := loadWorkflows(root)
	if err != nil {
		return nil, nil, err
	}

	var events []string

	for _, wf := range config.Workflows {
		for _, event := range wf.On {
			if !slices.Contains(events, event) {
				events = append(events, event)
			}
		}
	}

	var (
		hooks   []gitHook
		unknown []string
	)

	for _, event := range events {
		i := slices.IndexFunc(gitHooks, func(h gitHook) bool { return h.event == event })
		if i < 0 {
			unknown = append(unknown, event)

			continue
		}

		hooks = append(hooks, gitHooks[i])
	}

	return hooks, unknown, nil
}

// hooksDir asks git where the hooks of the repository at root live, which
// honors core.hooksPath and linked worktrees.
func hooksDir(ctx context.Context, root string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, gitHooksTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "git", "rev-parse", "--git-path", "hooks")
	cmd.Dir = root

	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("%w (%s): %w", errNotGitRepo, root, err)
	}

	dir := strings.TrimSpace(string(out))
	if !filepath.IsAbs(dir) {
		dir = filepath.Join(root, dir)
	}

	return dir, nil
}

// hookState is what a hook file holds today.
type hookState int

const (
	hookMissing hookState = iota
	hookManaged
	hookUser
)

func readHookState(path string) hookState {
	content, err := os.ReadFile(path) //nolint:gosec // G304: a file in the hooks directory
	if err != nil {
		return hookMissing
	}

	if bytes.Contains(content, []byte(hookMarker)) {
		return hookManaged
	}

	return hookUser
}

// installOptions control installHooks.
type installOptions struct {
	command string
	force   bool
	dryRun  bool
}

// installHooks writes a managed hook for each of hooks into dir and reports
// each one to w. A hook the user wrote stays unless force is set.
func installHooks(w io.Writer, dir string, hooks []gitHook, opts installOptions) error {
	if !opts.dryRun {
		if err := os.MkdirAll(dir, 0o755); err != nil { //nolint:gosec // G301: git's hooks directory
			return fmt.Errorf("create %s: %w", dir, err)
		}
	}

	installed, updated, skipped := 0, 0, 0

	for _, hook := range hooks {
		path := filepath.Join(dir, hook.name)
		state := readHookState(path)

		if state == hookUser && !opts.force {
			_, _ = fmt.Fprintf(w, "  skip  %s: a hook of your own is there (use --force to replace it)\n", hook.name)
			skipped++

			continue
		}

		verb := map[hookState]string{hookMissing: "install", hookManaged: "update", hookUser: "replace"}[state]

		if opts.dryRun {
			_, _ = fmt.Fprintf(w, "  would %s  %s\n", verb, hook.name)

			continue
		}

		if err := os.WriteFile(path, []byte(hookScript(opts.command, hook)), 0o755); err != nil { //nolint:gosec // G306: a hook must be executable
			return fmt.Errorf("write hook %s: %w", path, err)
		}

		// WriteFile keeps the mode of an existing file.
		if err := os.Chmod(path, 0o755); err != nil { //nolint:gosec // G302: a hook must be executable
			return fmt.Errorf("make hook %s executable: %w", path, err)
		}

		if state == hookManaged {
			_, _ = fmt.Fprintf(w, "  updated  %s\n", hook.name)
			updated++
		} else {
			_, _ = fmt.Fprintf(w, "  installed  %s\n", hook.name)
			installed++
		}
	}

	switch {
	case opts.dryRun:
		_, _ = fmt.Fprintln(w, "\n(dry run: no file changed)")
	case installed+updated+skipped == 0:
		_, _ = fmt.Fprintln(w, "\nNothing to do.")
	default:
		_, _ = fmt.Fprintf(w, "\nDone: %d installed, %d updated, %d skipped. The hooks run: %s\n",
			installed, updated, skipped, opts.command)
	}

	return nil
}

// uninstallHooks removes the managed hooks from dir.
func uninstallHooks(w io.Writer, dir string) error {
	removed := 0

	for _, hook := range gitHooks {
		path := filepath.Join(dir, hook.name)
		if readHookState(path) != hookManaged {
			continue
		}

		if err := os.Remove(path); err != nil {
			return fmt.Errorf("remove hook %s: %w", path, err)
		}

		_, _ = fmt.Fprintf(w, "  removed  %s\n", hook.name)
		removed++
	}

	if removed == 0 {
		_, _ = fmt.Fprintln(w, "No managed hooks found.")
	} else {
		_, _ = fmt.Fprintf(w, "\nDone: %d hook(s) removed.\n", removed)
	}

	return nil
}

func hooksInstallCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "install",
		Short: "Install git hooks that run the manifest's workflows",
		Long: "Writes a pre-commit, commit-msg or pre-push hook for each event the workflows of " +
			".eser/manifest.yml run on. The hooks run `" + devEserCommand + "` in an eser/stack checkout and " +
			"`eser` elsewhere; --command sets another command.",
		Flags: func(fs *flag.FlagSet) {
			force := fs.Bool("force", false, "replace hooks that eser did not write")
			fs.BoolVar(force, "f", false, "same as --force")
			dryRun := fs.Bool("dry-run", false, "show what would change and write nothing")
			fs.BoolVar(dryRun, "n", false, "same as --dry-run")
			fs.String("command", "", "the eser command the hooks run")
		},
		Run: func(c *clifx.Context) error {
			hooks, unknown, err := hookEvents(e.cwd)
			if err != nil {
				return err
			}

			for _, event := range unknown {
				_, _ = fmt.Fprintf(e.stdout, "  skip  %s (no git hook runs this event)\n", event)
			}

			dir, err := hooksDir(c, e.cwd)
			if err != nil {
				return err
			}

			command := c.String("command")
			if command == "" {
				command = hookCommand(e.cwd)
			}

			return installHooks(e.stdout, dir, hooks, installOptions{
				command: command,
				force:   c.Bool("force"),
				dryRun:  c.Bool("dry-run"),
			})
		},
	}
}

func hooksUninstallCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "uninstall",
		Short: "Remove the git hooks eser installed",
		Run: func(c *clifx.Context) error {
			dir, err := hooksDir(c, e.cwd)
			if err != nil {
				return err
			}

			return uninstallHooks(e.stdout, dir)
		},
	}
}

func hooksStatusCommand(e *env) *clifx.Command {
	return &clifx.Command{ //nolint:exhaustruct
		Name:  "status",
		Short: "Show which git hooks of the manifest's events are installed",
		Run: func(c *clifx.Context) error {
			hooks, _, err := hookEvents(e.cwd)
			if err != nil {
				return err
			}

			dir, err := hooksDir(c, e.cwd)
			if err != nil {
				return err
			}

			status := map[string]string{}
			labels := map[hookState]string{hookMissing: "not installed", hookManaged: "managed (eser)", hookUser: "user hook"}

			for _, hook := range hooks {
				status[hook.name] = labels[readHookState(filepath.Join(dir, hook.name))]
			}

			return c.Output(status, func(w io.Writer) error {
				for _, hook := range hooks {
					_, _ = fmt.Fprintf(w, "  %-12s %-10s %s\n", hook.name, hook.event, status[hook.name])
				}

				return nil
			})
		},
	}
}
