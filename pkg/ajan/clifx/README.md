# ⌨️ [ajan/clifx](./)

> **eserstack Go library** in the root module `github.com/eser/stack`. Import
> `github.com/eser/stack/pkg/ajan/clifx`. The module is not published for
> `go get`: build inside this repository, or require `github.com/eser/stack`
> with a `replace` directive that points at a checkout.

`clifx` builds command-line programs: a command tree with aliases, flags on the
standard library's `flag` package, generated help, exit codes, `--json` output
and shell completions. Its prompt primitives (confirm, select, multiselect,
text) run on [huh](https://github.com/charmbracelet/huh), the one prompt
dependency decision-26 allows. It keeps no global state: an `App` holds its
streams and a `Prompter` holds its input, output and clock, so tests drive both
with buffers.

## Quick Start

```go
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/eser/stack/pkg/ajan/clifx"
)

func main() {
	app := &clifx.App{
		Name:    "hello",
		Version: "1.0.0",
		Stdin:   os.Stdin,
		Stdout:  os.Stdout,
		Stderr:  os.Stderr,
		Root: &clifx.Command{
			Long: "hello greets people.",
			Subcommands: []*clifx.Command{{
				Name:    "greet",
				Aliases: []string{"g"},
				Short:   "Print a greeting",
				Flags: func(fs *flag.FlagSet) {
					fs.String("name", "world", "who to greet")
				},
				Run: func(c *clifx.Context) error {
					greeting := "hello " + c.String("name")

					return c.Output(map[string]string{"greeting": greeting}, func(w io.Writer) error {
						_, err := fmt.Fprintln(w, greeting)

						return err
					})
				},
			}},
		},
	}

	os.Exit(app.Run(context.Background(), os.Args[1:]))
}
```

```sh
$ hello g --name ada
hello ada
$ hello greet --json
{
  "greeting": "hello world"
}
$ hello nope
hello: unknown command "nope"
Usage: hello <command> [flags]
Run 'hello --help' for usage.
```

## Commands and exit codes

A `Command` selects by `Name` or any of its `Aliases`. `Flags` defines its flags
on a fresh `flag.FlagSet` for every run, and every command also takes `--json`
and `--help`. Flags may come before or after the positional arguments; `--` ends
them. A command with `Subcommands` and no `Run` prints its help. A command with
`RawArgs: true` gets every argument after its name in `Context.Args` as typed:
no flags are parsed, so `--help` and `--json` reach `Run` too. Use it for a
command that hands its arguments to another program.

`App.Run` returns the exit code:

| Code              | When                                                        |
| ----------------- | ----------------------------------------------------------- |
| `ExitOK` (0)      | the command succeeded, or help or `--version` was printed   |
| `ExitFailure` (1) | `Run` returned an error                                     |
| `ExitUsage` (2)   | an unknown command or flag, or `Run` returned `Usagef(...)` |
| any               | `Run` returned `&clifx.ExitError{Code: n}`                  |

`Context.Output(v, human)` writes `v` as indented JSON under `--json` and calls
`human` with stdout otherwise.

## Help and completions

`<app> --help`, `<app> <command> --help` and `<app> help <command>...` print the
description, usage line, aliases, commands and flags. Section headings are bold
on a color terminal and plain when piped.

`<app> completion bash|zsh|fish` prints a script for the shell. The scripts call
back `<app> __complete <words...>`, which prints the subcommands or, for a word
starting with `-`, the flags that match the last word. Hidden commands run but
stay out of help and completions.

```sh
source <(hello completion bash)
```

## Prompts

```go
// func (p *Prompter) Confirm(ctx context.Context, opts *ConfirmOptions) (bool, error)
// func (p *Prompter) Select(ctx context.Context, opts *SelectOptions) (string, error)
// func (p *Prompter) MultiSelect(ctx context.Context, opts *MultiSelectOptions) ([]string, error)
// func (p *Prompter) Text(ctx context.Context, opts *TextOptions) (string, error)
p := &clifx.Prompter{In: os.Stdin, Out: os.Stdout, Env: os.Environ()}

deploy, err := p.Confirm(ctx, &clifx.ConfirmOptions{Title: "Deploy now?", Timeout: time.Minute})

target, err := p.Select(ctx, &clifx.SelectOptions{
	Title:   "Target",
	Options: []clifx.Option{{Label: "Staging", Value: "staging"}, {Label: "Production", Value: "prod"}},
})
```

Without `Accessible` the prompts draw huh's terminal UI. With `Accessible: true`
they use huh's line mode: each question is printed and answered with one line (a
number for a select, one number per line then `0` for a multiselect), which
suits screen readers, pipes and tests. Output goes through colorprofile, so
styling is dropped when `Out` is not a color terminal.

A prompt with a `Timeout` returns `ErrPromptTimeout` when the `Clock` fires
first (`SystemClock` when none is set); Ctrl+C or Esc returns
`ErrPromptAborted`. In line mode a timed-out prompt leaves its read pending
until `In` delivers a line or closes.

## 🔗 Links

- `go doc github.com/eser/stack/pkg/ajan/clifx`: the API reference generated
  from source
- [ajan/logfx](../logfx/README.md): logging for the commands
- [eser/stack on GitHub](https://github.com/eser/stack)
