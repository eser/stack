// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Package clifx builds command-line programs: a command tree with aliases,
// flags on the standard library's flag package, generated help, exit codes,
// JSON output and shell completions, plus prompt primitives (confirm, select,
// multiselect, text) on huh (decision-26). It keeps no global state: an App
// holds its streams, and a Prompter holds its input, output and clock, so
// tests drive both with buffers.
//
//	app := &clifx.App{
//		Name:    "eser",
//		Version: "4.5.2",
//		Root: &clifx.Command{
//			Subcommands: []*clifx.Command{{
//				Name:    "greet",
//				Aliases: []string{"g"},
//				Short:   "Print a greeting",
//				Flags: func(fs *flag.FlagSet) {
//					fs.String("name", "world", "who to greet")
//				},
//				Run: func(c *clifx.Context) error {
//					return c.Output(map[string]string{"greeting": "hello " + c.String("name")},
//						func(w io.Writer) error { _, err := fmt.Fprintln(w, "hello", c.String("name")); return err })
//				},
//			}},
//		},
//		Stdout: os.Stdout, Stderr: os.Stderr, Stdin: os.Stdin,
//	}
//	os.Exit(app.Run(ctx, os.Args[1:]))
package clifx
