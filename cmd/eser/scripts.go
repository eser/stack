// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"slices"
	"strings"

	"github.com/eser/stack/pkg/ajan/clifx"
	"github.com/eser/stack/pkg/ajan/workflowfx"
)

var errScriptOrder = errors.New("script cannot run")

// scriptRunOrder returns the scripts to run for name, dependencies first, in
// the post-order the TypeScript runner uses; each dependency appears once. A
// depends cycle or a missing name is an error naming the chain.
func scriptRunOrder(scripts map[string]workflowfx.ScriptConfig, name string) ([]string, error) {
	var (
		order   []string
		walking []string
		visit   func(current, parent string) error
	)

	visit = func(current, parent string) error {
		if slices.Contains(order, current) {
			return nil
		}

		if i := slices.Index(walking, current); i >= 0 {
			cycle := strings.Join(append(slices.Clone(walking[i:]), current), " -> ")

			return fmt.Errorf("%w: script %q depends on itself through %s; remove one of these depends entries",
				errScriptOrder, current, cycle)
		}

		script, ok := scripts[current]
		if !ok {
			return fmt.Errorf("%w: script %q depends on %q, which the manifest does not define; add it or fix the name in the depends of %q",
				errScriptOrder, parent, current, parent)
		}

		walking = append(walking, current)

		for _, dependency := range script.Depends {
			if err := visit(dependency, current); err != nil {
				return err
			}
		}

		walking = walking[:len(walking)-1]
		order = append(order, current)

		return nil
	}

	if err := visit(name, name); err != nil {
		return nil, err
	}

	return order, nil
}

// shellQuote quotes s as one POSIX shell word.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

// resolveCommand replaces a leading `eser` word with this binary, so scripts
// run the same eser that runs them, without a global install.
func resolveCommand(command, self string) string {
	if command == "eser" || strings.HasPrefix(command, "eser ") {
		return shellQuote(filepath.ToSlash(self)) + command[len("eser"):]
	}

	return command
}

// shellArgs builds the sh arguments for a command and its forwarded words:
// the words follow the script as positional parameters and the script ends
// in "$@", so each one reaches the command as exactly one word.
func shellArgs(command string, extra []string) []string {
	if len(extra) == 0 {
		return []string{"-c", command}
	}

	return append([]string{"-c", strings.TrimRight(command, " \t") + ` "$@"`, "sh"}, extra...)
}

// runScript runs a manifest script after its dependencies. Dependencies get
// no forwarded arguments, and the first one that fails stops the run with
// its exit code.
func runScript(ctx context.Context, e *env, scripts map[string]workflowfx.ScriptConfig, name string, extra []string) int {
	order, err := scriptRunOrder(scripts, name)
	if err != nil {
		_, _ = fmt.Fprintf(e.stderr, "eser: %v\n", err)

		return clifx.ExitFailure
	}

	self, err := e.executable()
	if err != nil {
		self = "eser"
	}

	for _, current := range order {
		script := scripts[current]

		args := []string(nil)
		if current == name {
			args = extra
		} else {
			_, _ = fmt.Fprintf(e.stdout, "$ %s\n", current)
		}

		dir := e.cwd
		if script.WorkingDirectory != "" {
			dir = filepath.Join(e.cwd, script.WorkingDirectory)
		}

		code, err := e.runProcess(ctx, e, "sh", shellArgs(resolveCommand(script.Command, self), args), dir)
		if err != nil {
			_, _ = fmt.Fprintf(e.stderr, "eser: script %q: %v\n", current, err)

			return clifx.ExitFailure
		}

		if code != clifx.ExitOK {
			return code
		}
	}

	return clifx.ExitOK
}
