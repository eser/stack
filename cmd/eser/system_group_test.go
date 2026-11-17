// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package main

import (
	"encoding/json"
	"strings"
	"testing"
)

// The `system` group of the TypeScript eser (TASK-255): the same install,
// uninstall, update, version and doctor as the root commands, plus
// completions and info.
func TestSystemGroupListsTheTypeScriptSubcommands(t *testing.T) {
	t.Parallel()

	out, stderr, code := runCLI(t, testEnv(t), "system", "--help")
	if code != 0 {
		t.Fatalf("exit %d: %s", code, stderr)
	}

	for _, name := range []string{"install", "uninstall", "update", "completions", "version", "doctor", "info"} {
		if !strings.Contains(out, "\n  "+name+" ") {
			t.Errorf("eser system --help should list %s:\n%s", name, out)
		}
	}
}

func TestSystemVersion(t *testing.T) {
	t.Parallel()

	e := testEnv(t)
	e.version = "5.0.1"

	out, stderr, code := runCLI(t, e, "system", "version")
	if code != 0 || out != "eser 5.0.1\n" {
		t.Errorf("eser system version: exit %d %q %s", code, out, stderr)
	}
}

func TestSystemCompletions(t *testing.T) {
	t.Parallel()

	t.Run("a named shell", func(t *testing.T) {
		t.Parallel()

		out, stderr, code := runCLI(t, testEnv(t), "system", "completions", "--shell", "fish")
		if code != 0 || !strings.Contains(out, "complete -c eser") {
			t.Errorf("eser system completions --shell fish: exit %d\n%s%s", code, out, stderr)
		}
	})

	t.Run("the shell of $SHELL", func(t *testing.T) {
		t.Parallel()

		e := testEnv(t)
		e.getenv = func(key string) string {
			if key == "SHELL" {
				return "/bin/zsh"
			}

			return ""
		}

		out, stderr, code := runCLI(t, e, "system", "completions")
		if code != 0 || !strings.Contains(out, "#compdef eser") {
			t.Errorf("eser system completions under zsh: exit %d\n%s%s", code, out, stderr)
		}
	})

	t.Run("an unknown shell", func(t *testing.T) {
		t.Parallel()

		_, stderr, code := runCLI(t, testEnv(t), "system", "completions", "--shell", "tcsh")
		if code == 0 || !strings.Contains(stderr, "Supported shells: bash, zsh, fish") {
			t.Errorf("eser system completions --shell tcsh: exit %d %s", code, stderr)
		}
	})
}

func TestSystemInfo(t *testing.T) {
	t.Parallel()

	e := testEnv(t)
	e.goos, e.goarch = "linux", "arm64"

	out, stderr, code := runCLI(t, e, "system", "info", "--json")
	if code != 0 {
		t.Fatalf("exit %d: %s", code, stderr)
	}

	var info struct {
		Runtime  map[string]string `json:"runtime"`
		Location map[string]string `json:"locations"`
	}

	if err := json.Unmarshal([]byte(out), &info); err != nil {
		t.Fatalf("%v\n%s", err, out)
	}

	if info.Runtime["name"] != "go" || info.Runtime["platform"] != "linux" || info.Runtime["arch"] != "arm64" ||
		info.Location["cwd"] != e.cwd {
		t.Errorf("eser system info --json: %s", out)
	}

	text, _, code := runCLI(t, e, "system", "info")
	if code != 0 || !strings.Contains(text, "eser system info") || !strings.Contains(text, "  Runtime") {
		t.Errorf("eser system info: exit %d\n%s", code, text)
	}
}

func TestAjanVersion(t *testing.T) {
	t.Parallel()

	e := testEnv(t)
	e.version = "5.0.1"

	out, stderr, code := runCLI(t, e, "ajan", "version")
	if code != 0 || !strings.HasPrefix(out, "eser-ajan version 5.0.1 (") {
		t.Errorf("eser ajan version: exit %d %q %s", code, out, stderr)
	}
}
