// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package clifx_test

import (
	"bytes"
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"strings"
	"testing"

	"github.com/eser/stack/pkg/ajan/clifx"
)

type ran struct {
	path []string
	args []string
	name string
	json bool
}

// newApp builds a small tree: root > greet (g) [--name, --loud], codebase >
// validate (v) <files>..., fail, exit3, usage, a hidden command and a hidden
// command that takes its arguments raw.
func newApp(record *ran) (*clifx.App, *bytes.Buffer, *bytes.Buffer) {
	var stdout, stderr bytes.Buffer

	save := func(c *clifx.Context) {
		*record = ran{path: c.Path, args: c.Args, name: c.String("name"), json: c.JSON}
	}

	app := &clifx.App{
		Name:    "tool",
		Version: "1.2.3",
		Stdout:  &stdout,
		Stderr:  &stderr,
		Root: &clifx.Command{
			Long: "tool does things.",
			Subcommands: []*clifx.Command{
				{
					Name:    "greet",
					Aliases: []string{"g"},
					Short:   "Print a greeting",
					Flags: func(fs *flag.FlagSet) {
						fs.String("name", "world", "who to `person` greet")
						fs.Bool("loud", false, "shout")
					},
					Run: func(c *clifx.Context) error {
						save(c)

						greeting := "hello " + c.String("name")
						if c.Bool("loud") {
							greeting = strings.ToUpper(greeting)
						}

						return c.Output(map[string]string{"greeting": greeting}, func(w io.Writer) error {
							_, err := fmt.Fprintln(w, greeting)

							return err
						})
					},
				},
				{
					Name:  "codebase",
					Short: "Work on the codebase",
					Subcommands: []*clifx.Command{{
						Name:    "validate",
						Aliases: []string{"v"},
						Short:   "Validate files",
						Args:    "<file>...",
						Run: func(c *clifx.Context) error {
							save(c)
							if len(c.Args) == 0 {
								return clifx.Usagef("give at least one file")
							}

							return nil
						},
					}},
				},
				{Name: "fail", Short: "Always fail", Run: func(*clifx.Context) error { return errors.New("it broke") }},
				{Name: "exit3", Short: "Exit with 3", Run: func(*clifx.Context) error { return &clifx.ExitError{Code: 3} }},
				{Name: "secret", Hidden: true, Run: func(c *clifx.Context) error { save(c); return nil }},
				{Name: "pass", Hidden: true, RawArgs: true, Run: func(c *clifx.Context) error { save(c); return nil }},
			},
		},
	}

	return app, &stdout, &stderr
}

func TestRunParsing(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name     string
		args     []string
		code     int
		path     string
		rest     []string
		flagName string
		json     bool
		stdout   string
		stderr   string
	}{
		{name: "command with a default flag", args: []string{"greet"}, path: "tool greet", flagName: "world", stdout: "hello world\n"},
		{name: "alias and flags", args: []string{"g", "--name", "ada", "--loud"}, path: "tool greet", flagName: "ada", stdout: "HELLO ADA\n"},
		{name: "flag with =", args: []string{"greet", "-name=bob"}, path: "tool greet", flagName: "bob", stdout: "hello bob\n"},
		{name: "json output", args: []string{"greet", "--json"}, path: "tool greet", flagName: "world", json: true, stdout: "{\n  \"greeting\": \"hello world\"\n}\n"},
		{name: "nested alias and arguments", args: []string{"codebase", "v", "a.ts", "b.ts"}, path: "tool codebase validate", rest: []string{"a.ts", "b.ts"}},
		{name: "arguments after --", args: []string{"codebase", "validate", "--", "--odd"}, path: "tool codebase validate", rest: []string{"--odd"}},
		{name: "flags after arguments", args: []string{"codebase", "validate", "a.ts", "--json", "b.ts"}, path: "tool codebase validate", rest: []string{"a.ts", "b.ts"}, json: true},
		{name: "a flag after an argument on a command with flags", args: []string{"greet", "extra", "--name", "ada"}, path: "tool greet", flagName: "ada", stdout: "hello ada\n"},
		{name: "a usage error from Run", args: []string{"codebase", "validate"}, code: clifx.ExitUsage, path: "tool codebase validate", stderr: "give at least one file"},
		{name: "an unknown flag", args: []string{"greet", "--nope"}, code: clifx.ExitUsage, stderr: "flag provided but not defined: -nope"},
		{name: "an unknown subcommand", args: []string{"codebase", "nope"}, code: clifx.ExitUsage, stderr: `unknown command "nope"`},
		{name: "a failing command", args: []string{"fail"}, code: clifx.ExitFailure, stderr: "tool fail: it broke"},
		{name: "an exit code", args: []string{"exit3"}, code: 3},
		{name: "a hidden command still runs", args: []string{"secret"}, path: "tool secret"},
		{
			name: "raw arguments reach Run unparsed", args: []string{"pass", "push", "--force", "--json", "--help", "--", "x"},
			path: "tool pass", rest: []string{"push", "--force", "--json", "--help", "--", "x"},
		},
		{name: "version", args: []string{"--version"}, stdout: "tool 1.2.3\n"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			var record ran

			app, stdout, stderr := newApp(&record)

			if code := app.Run(context.Background(), tc.args); code != tc.code {
				t.Fatalf("exit code %d, want %d; stderr: %s", code, tc.code, stderr)
			}

			if tc.path != "" && strings.Join(record.path, " ") != tc.path {
				t.Errorf("path %v, want %q", record.path, tc.path)
			}

			if tc.rest != nil && strings.Join(record.args, ",") != strings.Join(tc.rest, ",") {
				t.Errorf("args %v, want %v", record.args, tc.rest)
			}

			if tc.flagName != "" && record.name != tc.flagName {
				t.Errorf("--name %q, want %q", record.name, tc.flagName)
			}

			if record.json != tc.json {
				t.Errorf("json %v, want %v", record.json, tc.json)
			}

			if tc.stdout != "" && stdout.String() != tc.stdout {
				t.Errorf("stdout %q, want %q", stdout, tc.stdout)
			}

			if !strings.Contains(stderr.String(), tc.stderr) {
				t.Errorf("stderr %q should contain %q", stderr, tc.stderr)
			}
		})
	}
}

func TestHelpOutput(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		args []string
		want string
	}{
		{
			name: "root without arguments",
			args: nil,
			want: `tool does things.

Usage: tool <command> [flags]

Commands:
  greet (g)  Print a greeting
  codebase   Work on the codebase
  fail       Always fail
  exit3      Exit with 3

Flags:
  --help                 show this help
  --json                 write the output as JSON

Run 'tool <command> --help' for a command's help.
`,
		},
		{
			name: "a command's --help",
			args: []string{"greet", "--help"},
			want: `Print a greeting

Usage: tool greet [flags]

Aliases: g

Flags:
  --help                 show this help
  --json                 write the output as JSON
  --loud                 shout
  --name person          who to person greet (default "world")
`,
		},
		{
			name: "help with a path",
			args: []string{"help", "codebase", "validate"},
			want: `Validate files

Usage: tool codebase validate [flags] <file>...

Aliases: v

Flags:
  --help                 show this help
  --json                 write the output as JSON
`,
		},
		{
			name: "a group without a subcommand",
			args: []string{"codebase"},
			want: `Work on the codebase

Usage: tool codebase <command> [flags]

Commands:
  validate (v)  Validate files

Flags:
  --help                 show this help
  --json                 write the output as JSON

Run 'tool codebase <command> --help' for a command's help.
`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			var record ran

			app, stdout, stderr := newApp(&record)

			if code := app.Run(context.Background(), tc.args); code != clifx.ExitOK {
				t.Fatalf("exit code %d; stderr: %s", code, stderr)
			}

			if stdout.String() != tc.want {
				t.Errorf("help:\n%s\nwant:\n%s", stdout, tc.want)
			}
		})
	}
}

func TestCompletions(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		args []string
		want string
	}{
		{name: "top level", args: []string{"__complete", ""}, want: "greet\ng\ncodebase\nfail\nexit3\ncompletion\nhelp\n"},
		{name: "a prefix", args: []string{"__complete", "co"}, want: "codebase\ncompletion\n"},
		{name: "nested", args: []string{"__complete", "codebase", ""}, want: "validate\nv\n"},
		{name: "flags of a command", args: []string{"__complete", "greet", "--"}, want: "--help\n--json\n--loud\n--name\n"},
		{name: "flags by prefix through an alias", args: []string{"__complete", "g", "--n"}, want: "--name\n"},
		{name: "hidden commands stay out", args: []string{"__complete", "se"}, want: ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			var record ran

			app, stdout, _ := newApp(&record)
			app.Run(context.Background(), tc.args)

			if stdout.String() != tc.want {
				t.Errorf("candidates %q, want %q", stdout, tc.want)
			}
		})
	}

	for _, shell := range []string{"bash", "zsh", "fish"} {
		t.Run("script "+shell, func(t *testing.T) {
			t.Parallel()

			var record ran

			app, stdout, _ := newApp(&record)

			if code := app.Run(context.Background(), []string{"completion", shell}); code != clifx.ExitOK {
				t.Fatalf("exit code %d", code)
			}

			if !strings.Contains(stdout.String(), "tool __complete") {
				t.Errorf("the %s script should call back 'tool __complete':\n%s", shell, stdout)
			}
		})
	}

	var record ran

	app, _, stderr := newApp(&record)
	if code := app.Run(context.Background(), []string{"completion", "tcsh"}); code != clifx.ExitUsage || !strings.Contains(stderr.String(), `unknown shell "tcsh"`) {
		t.Errorf("an unknown shell: code %d, stderr %q", code, stderr)
	}
}
