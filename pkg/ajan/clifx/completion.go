// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package clifx

import (
	"flag"
	"fmt"
	"strings"
)

// completeCommand is the hidden word the completion scripts call back with:
// `<app> __complete <words...>` prints one candidate per line for the last word.
const completeCommand = "__complete"

// completion writes the completion script for the named shell.
func (a *App) completion(args []string) int {
	if len(args) != 1 {
		a.writeUsageError(a.Root, []string{a.Name, "completion"}, Usagef("give one shell: bash, zsh or fish"))

		return ExitUsage
	}

	script, ok := completionScript(a.Name, args[0])
	if !ok {
		a.writeUsageError(a.Root, []string{a.Name, "completion"}, Usagef("unknown shell %q; give bash, zsh or fish", args[0]))

		return ExitUsage
	}

	_, _ = fmt.Fprint(a.Stdout, script)

	return ExitOK
}

func completionScript(name, shell string) (string, bool) {
	fn := "_" + strings.NewReplacer("-", "_", ".", "_").Replace(name) + "_complete"

	switch shell {
	case "bash":
		return fmt.Sprintf(`# bash completion for %[1]s; load with: source <(%[1]s completion bash)
%[2]s() {
  local IFS=$'\n'
  COMPREPLY=($(%[1]s %[3]s "${COMP_WORDS[@]:1:COMP_CWORD}" 2>/dev/null))
}
complete -o default -F %[2]s %[1]s
`, name, fn, completeCommand), true
	case "zsh":
		return fmt.Sprintf(`#compdef %[1]s
# zsh completion for %[1]s; load with: source <(%[1]s completion zsh)
%[2]s() {
  local -a candidates
  candidates=("${(@f)$(%[1]s %[3]s "${words[@]:1:$((CURRENT-1))}" 2>/dev/null)}")
  compadd -a candidates
}
compdef %[2]s %[1]s
`, name, fn, completeCommand), true
	case "fish":
		return fmt.Sprintf(`# fish completion for %[1]s; load with: %[1]s completion fish | source
complete -c %[1]s -f -a '(%[1]s %[2]s (commandline -opc)[2..-1] (commandline -ct))'
`, name, completeCommand), true
	default:
		return "", false
	}
}

// complete prints the candidates for the last of words, which is the word
// being typed ("" for a new word): subcommand names and aliases, or the
// command's flags when the word starts with "-".
func (a *App) complete(words []string) {
	cmd := a.Root
	path := []string{a.Name}

	current := ""
	if len(words) > 0 {
		current = words[len(words)-1]
		words = words[:len(words)-1]
	}

	for _, word := range words {
		if sub := cmd.find(word); sub != nil {
			cmd = sub
			path = append(path, sub.Name)
		}
	}

	if strings.HasPrefix(current, "-") {
		fs := newFlagSet(cmd, path)
		fs.Bool("json", false, "")
		fs.Bool("help", false, "")
		fs.VisitAll(func(f *flag.Flag) {
			if candidate := "--" + f.Name; strings.HasPrefix(candidate, current) {
				_, _ = fmt.Fprintln(a.Stdout, candidate)
			}
		})

		return
	}

	for _, sub := range cmd.Subcommands {
		if sub.Hidden {
			continue
		}

		for _, word := range append([]string{sub.Name}, sub.Aliases...) {
			if strings.HasPrefix(word, current) {
				_, _ = fmt.Fprintln(a.Stdout, word)
			}
		}
	}

	if cmd == a.Root {
		for _, builtin := range []string{"completion", "help"} {
			if strings.HasPrefix(builtin, current) && cmd.find(builtin) == nil {
				_, _ = fmt.Fprintln(a.Stdout, builtin)
			}
		}
	}
}
