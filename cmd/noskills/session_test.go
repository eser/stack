// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The golden scenarios sessions, user_identity and diagrams compare these
// commands with the TypeScript CLI; these tests check they run in Go.
func TestSessionConfigAndDiagramsRunInGo(t *testing.T) {
	t.Parallel()

	cases := []struct {
		args []string
		code int
		want string
	}{
		{args: []string{"session"}, code: 0, want: "session <start | end | list | gc>"},
		{args: []string{"session", "start", "--free"}, code: 1, want: "noskills is not initialized."},
		{args: []string{"session", "list"}, code: 0, want: "No active sessions."},
		{args: []string{"session", "end", "--id=x"}, code: 1, want: "Session not found: x"},
		{args: []string{"config"}, code: 0, want: "config <set-user | get-user | clear-user>"},
		{args: []string{"config", "get-user"}, code: 0, want: "No user configured."},
		{args: []string{"config", "set-user", "--from-git"}, code: 1, want: "Could not read git user config."},
		{args: []string{"diagrams"}, code: 0, want: "No diagrams registered."},
		{args: []string{"diagrams", "bogus"}, code: 1, want: "Unknown subcommand."},
		{args: []string{"diagrams", "scan"}, code: 1, want: "noskills is not initialized."},
	}

	for _, tc := range cases {
		t.Run(strings.Join(tc.args, " "), func(t *testing.T) {
			t.Parallel()

			te := newTestEnv(t, t.TempDir())
			te.vars["HOME"] = t.TempDir()
			te.vars[envTSCLI] = "node main.ts"

			code := run(context.Background(), te.env, tc.args)
			if code != tc.code || !strings.Contains(te.stdout.String(), tc.want) {
				t.Errorf("exit %d, stdout %q; want %d and %q", code, te.stdout, tc.code, tc.want)
			}

			if len(te.calls) != 0 {
				t.Errorf("forwarded: %+v", te.calls)
			}
		})
	}
}

func TestConfigSetUserFromGit(t *testing.T) {
	t.Parallel()

	home := t.TempDir()
	te := newTestEnv(t, t.TempDir())
	te.vars["HOME"] = home
	te.runGit = func(_ context.Context, _ string, args []string, _ string) (string, bool, error) {
		return map[string]string{"user.name": "Grace Hopper\n", "user.email": "grace@example.com\n"}[args[len(args)-1]], true, nil
	}

	if code := run(context.Background(), te.env, []string{"config", "set-user", "--from-git", "--name=Ignored"}); code != 0 {
		t.Fatalf("exit %d: %s%s", code, te.stdout, te.stderr)
	}

	if !strings.Contains(te.stdout.String(), "User set: ") || !strings.Contains(te.stdout.String(), "Grace Hopper <grace@example.com>") {
		t.Errorf("stdout %q", te.stdout)
	}

	data, err := os.ReadFile(filepath.Join(home, ".config", "eser", "noskills", "user.json")) //nolint:gosec // G304: the test's temp home
	if err != nil || !strings.Contains(string(data), `"name": "Grace Hopper"`) {
		t.Errorf("user.json %q, %v", data, err)
	}
}
