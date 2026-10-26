// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package clifx

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"slices"
	"strings"
)

// Exit codes App.Run returns.
const (
	ExitOK      = 0
	ExitFailure = 1 // the command ran and failed
	ExitUsage   = 2 // unknown command, bad flag or wrong arguments
)

var (
	// ErrUsage marks an error as a usage error: Run prints it with the
	// command's usage line and exits with ExitUsage.
	ErrUsage = errors.New("usage error")
	// ErrUnknownCommand is the usage error for a name no subcommand has.
	ErrUnknownCommand = errors.New("unknown command")
)

// ExitError ends Run with a chosen exit code. A nil Err exits silently.
type ExitError struct {
	Err  error
	Code int
}

func (e *ExitError) Error() string {
	if e.Err == nil {
		return fmt.Sprintf("exit code %d", e.Code)
	}

	return e.Err.Error()
}

func (e *ExitError) Unwrap() error { return e.Err }

// Command is one node of the command tree. A command with Subcommands and no
// Run prints its help when called alone.
type Command struct {
	// Name is the word that selects the command; the root's is ignored.
	Name    string
	Aliases []string
	// Short is the one-line summary shown in the parent's command list.
	Short string
	// Long is the description shown in the command's own help.
	Long string
	// Args names the positional arguments in the usage line, such as "<file>...".
	Args string
	// Flags defines the command's flags on a fresh FlagSet for every run.
	Flags func(fs *flag.FlagSet)
	// Run is called with the parsed flags and the remaining arguments.
	Run         func(c *Context) error
	Subcommands []*Command
	// Hidden keeps the command out of help and completions.
	Hidden bool
	// RawArgs hands Run every argument after the command's words untouched:
	// no flag parsing, so no --help or --json either, and no subcommand
	// lookup below it. For commands that pass their arguments on, such as
	// a wrapper around another program.
	RawArgs bool
}

func (c *Command) find(word string) *Command {
	for _, sub := range c.Subcommands {
		if sub.Name == word || slices.Contains(sub.Aliases, word) {
			return sub
		}
	}

	return nil
}

// App is a program: its command tree and its streams.
type App struct {
	Name    string
	Version string
	Root    *Command
	Stdin   io.Reader
	Stdout  io.Writer
	Stderr  io.Writer
}

// Context is what a command's Run receives.
type Context struct {
	context.Context //nolint:containedctx // the run's context, handed to Run with the parsed input

	App     *App
	Command *Command
	// Path is the command words from the root, such as ["eser", "codebase", "validate"].
	Path  []string
	Args  []string
	Flags *flag.FlagSet
	// JSON is true when --json was given.
	JSON bool
}

// String returns the value of a string flag, or "" when it is not defined.
func (c *Context) String(name string) string {
	if f := c.Flags.Lookup(name); f != nil {
		return f.Value.String()
	}

	return ""
}

// Bool returns the value of a bool flag, or false when it is not defined.
func (c *Context) Bool(name string) bool {
	if f := c.Flags.Lookup(name); f != nil {
		getter, ok := f.Value.(flag.Getter)
		if ok {
			value, _ := getter.Get().(bool)

			return value
		}
	}

	return false
}

// Output writes v as indented JSON when --json was given, and calls human
// with stdout otherwise.
func (c *Context) Output(v any, human func(w io.Writer) error) error {
	if !c.JSON {
		return human(c.App.Stdout)
	}

	enc := json.NewEncoder(c.App.Stdout)
	enc.SetIndent("", "  ")

	if err := enc.Encode(v); err != nil {
		return fmt.Errorf("write JSON output: %w", err)
	}

	return nil
}

// Usagef returns a usage error with a message.
func Usagef(format string, args ...any) error {
	return fmt.Errorf("%w: %s", ErrUsage, fmt.Sprintf(format, args...))
}

// Run parses args (without the program name), runs the selected command and
// returns the exit code. Help (-h, --help or the help command) and --version
// exit with ExitOK; usage errors with ExitUsage; a failing Run with
// ExitFailure, or with an *ExitError's code.
func (a *App) Run(ctx context.Context, args []string) int {
	if len(args) == 1 && (args[0] == "--version" || args[0] == "-V") && a.Version != "" {
		_, _ = fmt.Fprintf(a.Stdout, "%s %s\n", a.Name, a.Version)

		return ExitOK
	}

	cmd := a.Root
	path := []string{a.Name}

	// Built-in words at the root.
	if len(args) > 0 && cmd.find(args[0]) == nil {
		switch args[0] {
		case "help":
			return a.helpFor(args[1:])
		case "completion":
			return a.completion(args[1:])
		case completeCommand:
			a.complete(args[1:])

			return ExitOK
		}
	}

	for len(args) > 0 && !strings.HasPrefix(args[0], "-") && !cmd.RawArgs {
		sub := cmd.find(args[0])
		if sub == nil {
			break
		}

		cmd = sub
		path = append(path, sub.Name)
		args = args[1:]
	}

	if cmd.RawArgs && cmd.Run != nil {
		fs := flag.NewFlagSet(strings.Join(path, " "), flag.ContinueOnError)
		err := cmd.Run(&Context{Context: ctx, App: a, Command: cmd, Path: path, Args: args, Flags: fs, JSON: false})

		return a.exitCode(cmd, path, err)
	}

	fs := newFlagSet(cmd, path)

	jsonOut := false
	fs.BoolVar(&jsonOut, "json", false, "write the output as JSON")

	positional, err := parseInterspersed(fs, args)
	if err != nil {
		if errors.Is(err, flag.ErrHelp) {
			a.writeHelp(a.Stdout, cmd, path)

			return ExitOK
		}

		a.writeUsageError(cmd, path, err)

		return ExitUsage
	}

	if cmd.Run == nil {
		if len(positional) > 0 && len(cmd.Subcommands) > 0 {
			a.writeUsageError(cmd, path, fmt.Errorf("%w %q", ErrUnknownCommand, positional[0]))

			return ExitUsage
		}

		a.writeHelp(a.Stdout, cmd, path)

		return ExitOK
	}

	err = cmd.Run(&Context{Context: ctx, App: a, Command: cmd, Path: path, Args: positional, Flags: fs, JSON: jsonOut})

	return a.exitCode(cmd, path, err)
}

func (a *App) exitCode(cmd *Command, path []string, err error) int {
	if err == nil {
		return ExitOK
	}

	if exitErr, ok := errors.AsType[*ExitError](err); ok {
		if exitErr.Err != nil {
			_, _ = fmt.Fprintf(a.Stderr, "%s: %v\n", strings.Join(path, " "), exitErr.Err)
		}

		return exitErr.Code
	}

	if errors.Is(err, ErrUsage) {
		a.writeUsageError(cmd, path, err)

		return ExitUsage
	}

	_, _ = fmt.Fprintf(a.Stderr, "%s: %v\n", strings.Join(path, " "), err)

	return ExitFailure
}

// parseInterspersed parses flags wherever they appear among the arguments,
// as `cmd value --flag` users expect; "--" ends the flags, and everything
// after it is positional.
func parseInterspersed(fs *flag.FlagSet, args []string) ([]string, error) {
	var positional []string

	for {
		if err := fs.Parse(args); err != nil {
			return nil, err //nolint:wrapcheck // flag's own messages are shown as they are
		}

		rest := fs.Args()

		if consumed := len(args) - len(rest); consumed > 0 && args[consumed-1] == "--" {
			return append(positional, rest...), nil
		}

		if len(rest) == 0 {
			return positional, nil
		}

		positional = append(positional, rest[0])
		args = rest[1:]
	}
}

func newFlagSet(cmd *Command, path []string) *flag.FlagSet {
	fs := flag.NewFlagSet(strings.Join(path, " "), flag.ContinueOnError)
	fs.SetOutput(io.Discard) // Run prints errors and help itself.

	if cmd.Flags != nil {
		cmd.Flags(fs)
	}

	return fs
}

func (a *App) writeUsageError(cmd *Command, path []string, err error) {
	_, _ = fmt.Fprintf(a.Stderr, "%s: %v\n", strings.Join(path, " "), err)
	_, _ = fmt.Fprintf(a.Stderr, "%s\nRun '%s --help' for usage.\n", usageLine(cmd, path), strings.Join(path, " "))
}

func (a *App) helpFor(words []string) int {
	cmd := a.Root
	path := []string{a.Name}

	for _, word := range words {
		sub := cmd.find(word)
		if sub == nil {
			a.writeUsageError(cmd, path, fmt.Errorf("%w %q", ErrUnknownCommand, word))

			return ExitUsage
		}

		cmd = sub
		path = append(path, sub.Name)
	}

	a.writeHelp(a.Stdout, cmd, path)

	return ExitOK
}
