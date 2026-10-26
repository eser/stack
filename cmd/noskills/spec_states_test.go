// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"slices"
	"strings"
	"testing"
)

// TestWatchForwardsItsArgumentsUnchanged checks that `noskills watch`, the
// read-only dashboard M5 ports (TASK-266), reaches the TypeScript watch with
// every argument as given, like manager and web, and returns its exit code.
func TestWatchForwardsItsArgumentsUnchanged(t *testing.T) {
	t.Parallel()

	for _, args := range [][]string{
		{"watch"},
		{"watch", "-o", "json"},
		{"watch", "--output=markdown"},
		{"watch", "-o", "markdown", "--spec=add-login-page", "two words", "--", "-x"},
	} {
		te := newTestEnv(t, initializedProject(t, "EXECUTING"))
		te.vars[envTSCLI] = "node /path/to/main.ts"
		te.exit = 4

		if code := run(context.Background(), te.env, args); code != 4 {
			t.Errorf("%v: exit %d, want the forwarded 4", args, code)
		}

		if len(te.calls) != 1 {
			t.Fatalf("%v: ran %+v", args, te.calls)
		}

		call := te.calls[0]
		if call.name != "node" || !slices.Equal(call.args, append([]string{"/path/to/main.ts"}, args...)) {
			t.Errorf("%v: ran %s %v", args, call.name, call.args)
		}

		if te.stdout.Len() != 0 {
			t.Errorf("%v: printed %q itself", args, te.stdout.String())
		}
	}
}

// TestWatchWithoutForwarding checks that NOSKILLS_NO_FORWARD=1 makes watch
// fail with the reason instead of starting anything.
func TestWatchWithoutForwarding(t *testing.T) {
	t.Parallel()

	te := newTestEnv(t, initializedProject(t, "IDLE"))
	te.vars[envNoForward] = "1"

	if code := run(context.Background(), te.env, []string{"watch", "-o", "json"}); code != 1 {
		t.Errorf("exit %d, want 1", code)
	}

	if len(te.calls) != 0 || !strings.Contains(te.stderr.String(), envNoForward) {
		t.Errorf("ran %+v, stderr %q", te.calls, te.stderr.String())
	}
}

// TestSpecStateCommandsRunInGo checks that the commands TASK-258.1 ported
// never start the TypeScript CLI.
func TestSpecStateCommandsRunInGo(t *testing.T) {
	t.Parallel()

	for _, args := range [][]string{
		{"free"}, {"validate"}, {"validate", "no-such"}, {"block"}, {"reset"}, {"cancel"}, {"wontfix"}, {"reopen"},
		{"next", "-o", "markdown"}, {"status", "--output=text"}, {"spec", "list", "-o", "md"},
		{"ledger", "a", "-o", "text"},
	} {
		te := newTestEnv(t, initializedProject(t, "IDLE"))
		te.vars[envTSCLI] = "node main.ts"

		_ = run(context.Background(), te.env, args)

		if len(te.calls) != 0 {
			t.Errorf("%v: forwarded %+v", args, te.calls)
		}
	}
}
