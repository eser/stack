// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package clifx

import (
	"flag"
	"fmt"
	"io"
	"strings"

	"charm.land/lipgloss/v2"
)

// headingStyle styles the help section headings. lipgloss.Fprint drops the
// styling when the writer is not a color terminal, so piped help is plain.
var headingStyle = lipgloss.NewStyle().Bold(true) //nolint:gochecknoglobals // an immutable style value

func usageLine(cmd *Command, path []string) string {
	parts := []string{"Usage:", strings.Join(path, " ")}

	if visibleSubcommands(cmd) > 0 {
		parts = append(parts, "<command>")
	}

	parts = append(parts, "[flags]")

	if cmd.Args != "" {
		parts = append(parts, cmd.Args)
	}

	return strings.Join(parts, " ")
}

func visibleSubcommands(cmd *Command) int {
	count := 0

	for _, sub := range cmd.Subcommands {
		if !sub.Hidden {
			count++
		}
	}

	return count
}

func (a *App) writeHelp(w io.Writer, cmd *Command, path []string) {
	var b strings.Builder

	description := cmd.Long
	if description == "" {
		description = cmd.Short
	}

	if description != "" {
		b.WriteString(strings.TrimSpace(description) + "\n\n")
	}

	b.WriteString(usageLine(cmd, path) + "\n")

	if len(cmd.Aliases) > 0 {
		b.WriteString("\n" + headingStyle.Render("Aliases:") + " " + strings.Join(cmd.Aliases, ", ") + "\n")
	}

	if visibleSubcommands(cmd) > 0 {
		b.WriteString("\n" + headingStyle.Render("Commands:") + "\n")

		width := 0

		for _, sub := range cmd.Subcommands {
			if !sub.Hidden {
				width = max(width, len(commandLabel(sub)))
			}
		}

		for _, sub := range cmd.Subcommands {
			if !sub.Hidden {
				fmt.Fprintf(&b, "  %-*s  %s\n", width, commandLabel(sub), sub.Short)
			}
		}
	}

	fs := newFlagSet(cmd, path)
	fs.Bool("json", false, "write the output as JSON")
	fs.Bool("help", false, "show this help")

	b.WriteString("\n" + headingStyle.Render("Flags:") + "\n")
	fs.VisitAll(func(f *flag.Flag) {
		b.WriteString(flagLine(f))
	})

	if visibleSubcommands(cmd) > 0 {
		fmt.Fprintf(&b, "\nRun '%s <command> --help' for a command's help.\n", strings.Join(path, " "))
	}

	_, _ = lipgloss.Fprint(w, b.String())
}

func commandLabel(cmd *Command) string {
	if len(cmd.Aliases) == 0 {
		return cmd.Name
	}

	return cmd.Name + " (" + strings.Join(cmd.Aliases, ", ") + ")"
}

func flagLine(f *flag.Flag) string {
	name, usage := flag.UnquoteUsage(f)

	label := "--" + f.Name
	if name != "" {
		label += " " + name
	}

	line := fmt.Sprintf("  %-22s %s", label, usage)

	if f.DefValue != "" && f.DefValue != "false" && f.DefValue != "0" {
		line += fmt.Sprintf(" (default %q)", f.DefValue)
	}

	return line + "\n"
}
