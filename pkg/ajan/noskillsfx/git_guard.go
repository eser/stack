// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"regexp"
	"slices"
	"strings"
)

// The git guard: pure predicates that decide whether a shell command only
// reads git state, and detect writes smuggled through subshells, pipes and
// scripts. Port of pkg/@eserstack/agents/guards/git.ts; both sides keep one
// allowlist, and the parity test in hook_parity_test.go replays the
// TypeScript answers for a corpus of commands.

// GitAllowedSubcommands are the subcommands that only read repository
// state, whatever their arguments.
func GitAllowedSubcommands() []string {
	return []string{
		"log", "diff", "status", "show", "blame", "rev-parse", "ls-files", "ls-tree", "cat-file",
		"describe", "shortlog", "name-rev", "for-each-ref", "rev-list", "help", "version",
	}
}

// gitConditionalRead is a subcommand that reads only when its first argument
// is one of firstArgs; "" stands for no argument at all (`git branch`).
type gitConditionalRead struct {
	subcommand string
	firstArgs  []string
}

// gitConditionalReads lists them in the TypeScript map's order.
func gitConditionalReads() []gitConditionalRead {
	return []gitConditionalRead{
		{subcommand: "branch", firstArgs: []string{
			"", "--list", "-l", "-a", "--all", "-r", "--remotes", "-v", "--verbose",
			"--contains", "--no-contains", "--merged", "--no-merged", "--show-current",
		}},
		{subcommand: "tag", firstArgs: []string{"", "-l", "--list", "-v", "--verify", "-n"}},
		{subcommand: "stash", firstArgs: []string{"list", "show"}},
		{subcommand: "remote", firstArgs: []string{"", "-v", "--verbose", "show", "get-url"}},
		{subcommand: "reflog", firstArgs: []string{"", "show"}},
	}
}

// gitGlobalFlagsWithArg take a value before the subcommand: as the next
// argument (`-C dir`), or after `=` for the long ones.
func gitGlobalFlagsWithArg() []string {
	return []string{"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--super-prefix", "--config-env", "--attr-source"}
}

// gitGlobalFlagsInlineArg take their value only after `=`.
func gitGlobalFlagsInlineArg() []string {
	return []string{"--exec-path"}
}

// gitGlobalFlagsNoArg take no value.
func gitGlobalFlagsNoArg() []string {
	return []string{
		"--no-replace-objects", "--no-lazy-fetch", "--no-advice", "--bare", "--no-optional-locks",
		"--literal-pathspecs", "--glob-pathspecs", "--noglob-pathspecs", "--icase-pathspecs",
		"--no-pager", "-P", "--paginate", "-p",
	}
}

// gitInfoOptions take the place of a subcommand: git prints and exits.
func gitInfoOptions() []string {
	return []string{"--version", "-v", "--help", "-h", "--exec-path", "--html-path", "--man-path", "--info-path"}
}

// gitRemoteWriteSubcommands send commits to another repository.
func gitRemoteWriteSubcommands() []string {
	return []string{"push", "send-pack"}
}

func gitConfigReadActions() []string {
	return []string{"--get", "--get-all", "--get-regexp", "--get-urlmatch", "--get-color", "--get-colorbool", "--list", "-l"}
}

func gitConfigReadSubcommands() []string {
	return []string{"get", "list"}
}

func gitConfigNeutralFlags() []string {
	return []string{
		"--global", "--local", "--system", "--worktree", "--show-origin", "--show-scope", "--name-only",
		"--null", "-z", "--includes", "--no-includes", "--bool", "--int", "--bool-or-int", "--path",
		"--expiry-date", "--no-type", "--fixed-value", "--all",
	}
}

func gitConfigFlagsWithArg() []string {
	return []string{"--file", "-f", "--blob", "--type", "--default", "--url"}
}

// isGitConfigRead reports whether the arguments after `git config` only read
// configuration.
func isGitConfigRead(args []string) bool {
	readAction := false

	var positionals []string

	for i := 0; i < len(args); i++ {
		arg := args[i]

		switch {
		case slices.Contains(gitConfigReadActions(), arg):
			readAction = true

			continue
		case slices.Contains(gitConfigNeutralFlags(), arg):
			continue
		case slices.Contains(gitConfigFlagsWithArg(), arg):
			i++

			continue
		}

		if strings.HasPrefix(arg, "--") && strings.Contains(arg, "=") {
			name, _, _ := strings.Cut(arg, "=")
			if slices.Contains(gitConfigFlagsWithArg(), name) {
				continue
			}

			return false
		}

		// Any other flag (--add, --unset, --edit, ...) may write.
		if strings.HasPrefix(arg, "-") {
			return false
		}

		positionals = append(positionals, arg)
	}

	if readAction {
		return true
	}

	if len(positionals) > 0 && slices.Contains(gitConfigReadSubcommands(), positionals[0]) {
		return true
	}

	// `git config <name>` reads one key; a second positional is its new value.
	return len(positionals) == 1
}

func isInlineGlobalFlag(arg string) bool {
	name, _, found := strings.Cut(arg, "=")
	if !strings.HasPrefix(arg, "--") || !found {
		return false
	}

	return slices.Contains(gitGlobalFlagsWithArg(), name) || slices.Contains(gitGlobalFlagsInlineArg(), name)
}

func extractGitSubcommandIndex(tokens []string) int {
	i := 0
	for i < len(tokens) {
		arg := tokens[i]

		switch {
		case slices.Contains(gitGlobalFlagsWithArg(), arg):
			i += 2
		case slices.Contains(gitGlobalFlagsNoArg(), arg), isInlineGlobalFlag(arg):
			i++
		case strings.HasPrefix(arg, "-C") && jsLength(arg) > 2:
			i++
		case strings.HasPrefix(arg, "-c") && jsLength(arg) > 2 && strings.Contains(arg, "="):
			i++
		default:
			return i
		}
	}

	return -1
}

// unquoteWord removes shell quoting and backslashes from one word, so
// `g”it`, `"git"` and `\git` read as the program the shell runs.
func unquoteWord(word string) string {
	return strings.NewReplacer(`"`, "", `'`, "", `\`, "").Replace(word)
}

// isGitProgram reports whether a program token names the git binary.
func isGitProgram(token string) bool {
	base := strings.ToLower(jsLastPathPart(unquoteWord(token), `/\`))

	return base == "git" || base == "git.exe"
}

// commandPrefixWords run the rest of the line as a command.
func commandPrefixWords() []string {
	return []string{"env", "command", "exec", "sudo", "nohup", "time", "nice", "builtin"}
}

//nolint:gochecknoglobals // compiled once, read-only
var (
	envAssignment    = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*=`)
	dynamicProgram   = regexp.MustCompile(`^\$(?:[A-Za-z_][A-Za-z0-9_]*|\{[^}]+\})$`)
	phraseSeparators = regexp.MustCompile(`&&|\|\||;|\n`)
	phraseOrPipe     = regexp.MustCompile(`&&|\|\||;|\n|\|`)
	gitWord          = regexp.MustCompile(`(?i)git`)
	gitFragment      = regexp.MustCompile(`(?i)(?:^|[` + jsSpaceClass + `($` + "`" + `/\\])git\b`)
	shellCommandName = regexp.MustCompile(`^(?:ba|z|k|da|a)?sh$`)

	// Subshells: any *sh with a -c variant and its inner string, quoted or
	// not, and eval.
	subshellPatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?:^|` + jsSpace + `)(?:` + jsNonSpace + `*/)?[a-z]*sh` + jsSpace + `+-\w*c` + jsSpace + `+\$?["'](` + jsAnyChar + `+?)["']`),
		regexp.MustCompile(`(?:^|` + jsSpace + `)(?:` + jsNonSpace + `*/)?[a-z]*sh` + jsSpace + `+-\w*c` + jsSpace + `+(` + jsNonSpace + `+)`),
		regexp.MustCompile(`eval` + jsSpace + `+["'](` + jsAnyChar + `+?)["']`),
	}

	shellProgram = `(?:` + jsNonSpace + `*/)?(?:ba|z|k|da|a)?sh`
	// A pipe into a shell: `... | sh`. JavaScript's multiline `$` matches
	// before any line terminator; the class takes \r, U+2028 and U+2029, and
	// (?m)$ takes \n and the end.
	pipeIntoShell = regexp.MustCompile(`(?m)\|` + jsSpace + `*` + shellProgram + `(?:` + jsSpace + `+-\w+)*` + jsSpace + `*(?:$|[;&|)\r\x{2028}\x{2029}])`)
	// A shell reading a heredoc: `sh <<EOF`.
	shellHeredoc = regexp.MustCompile(`(?:^|[` + jsSpaceClass + `;&|(])` + shellProgram + `(?:` + jsSpace + `+-\w+)*` + jsSpace + `*<<`)

	flagValueSingle = regexp.MustCompile(`--\w+='[^']*'`)
	flagValueDouble = regexp.MustCompile(`--\w+="[^"]*"`)
	flagValueBare   = regexp.MustCompile(`--\w+=` + jsNonSpace + `*`)
)

// jsAnyChar is JavaScript's `.`: any character but a line terminator.
const jsAnyChar = `[^\n\r\x{2028}\x{2029}]`

// programIndex is the index of the program token in a segment: it skips
// NAME=value assignments and wrapper words such as env or sudo, with the
// flags they take. -1 when the segment holds no program.
func programIndex(tokens []string) int {
	i := 0
	for i < len(tokens) {
		word := unquoteWord(tokens[i])
		if envAssignment.MatchString(word) {
			i++

			continue
		}

		if slices.Contains(commandPrefixWords(), strings.ToLower(word)) {
			i++
			for i < len(tokens) && strings.HasPrefix(tokens[i], "-") {
				i++
			}

			continue
		}

		return i
	}

	return -1
}

// isDynamicProgram reports whether the program comes from a variable
// (`$GIT push`), so the text cannot tell whether it is git.
func isDynamicProgram(token string) bool {
	return dynamicProgram.MatchString(unquoteWord(token))
}

// IsGitAllowed reports whether one git command segment only reads. A command
// that is not git is allowed: the guard governs git only.
func IsGitAllowed(command string) bool {
	trimmed := jsTrim(command)
	if trimmed == "" {
		return true
	}

	allTokens := jsSplitWhitespace(trimmed)

	progIdx := programIndex(allTokens)
	if progIdx == -1 {
		return true
	}

	tokens := allTokens[progIdx:]

	if isDynamicProgram(tokens[0]) && len(tokens) > 1 {
		return false
	}

	if !isGitProgram(tokens[0]) {
		return true
	}

	args := make([]string, 0, len(tokens)-1)
	for _, token := range tokens[1:] {
		args = append(args, unquoteWord(token))
	}

	return IsGitArgsAllowed(args)
}

// GitArgs is a git argument vector split at its subcommand.
type GitArgs struct {
	GlobalOptions  []string
	Subcommand     string // "" when there is none (bare `git`)
	SubcommandArgs []string
}

// SplitGitArgs splits the arguments git receives (without the program name)
// at the subcommand. An option git prints and exits on (`--version`) stands
// in the subcommand's place.
func SplitGitArgs(args []string) GitArgs {
	subIndex := extractGitSubcommandIndex(args)
	if subIndex == -1 {
		return GitArgs{GlobalOptions: args, Subcommand: "", SubcommandArgs: []string{}}
	}

	return GitArgs{
		GlobalOptions:  args[:subIndex],
		Subcommand:     args[subIndex],
		SubcommandArgs: args[subIndex+1:],
	}
}

// IsGitArgsAllowed reports whether git, run with these arguments, only reads.
func IsGitArgsAllowed(args []string) bool {
	split := SplitGitArgs(args)

	switch {
	case split.Subcommand == "":
		return true // bare git shows help
	case slices.Contains(GitAllowedSubcommands(), split.Subcommand), slices.Contains(gitInfoOptions(), split.Subcommand):
		return true
	case split.Subcommand == "config":
		return isGitConfigRead(split.SubcommandArgs)
	}

	for _, read := range gitConditionalReads() {
		if read.subcommand != split.Subcommand {
			continue
		}

		next := ""
		if len(split.SubcommandArgs) > 0 {
			next = split.SubcommandArgs[0]
		}

		return slices.Contains(read.firstArgs, next)
	}

	return false
}

// IsGitRemoteWrite reports whether git, run with these arguments, sends
// commits to another repository.
func IsGitRemoteWrite(args []string) bool {
	return slices.Contains(gitRemoteWriteSubcommands(), SplitGitArgs(args).Subcommand)
}

// ExtractGitInvocations returns every `git ...` fragment of a command:
// multi-line scripts, &&, || and ; chains, $(git ...) and backticks.
func ExtractGitInvocations(command string) []string {
	invocations := []string{}

	for _, phrase := range jsSplit(command, phraseSeparators) {
		trimmed := jsTrim(phrase)
		if trimmed == "" {
			continue
		}

		// A program token the fragment scan cannot see because it is quoted
		// or escaped, or picked from a variable.
		words := jsSplitWhitespace(trimmed)
		if progIdx := programIndex(words); progIdx != -1 {
			prog := words[progIdx]
			hidden := unquoteWord(prog) != prog && isGitProgram(prog)

			if hidden || isDynamicProgram(prog) {
				tail := strings.Join(words[progIdx:], " ")
				invocations = append(invocations, jsTrim(jsFirstSegment(tail, "|&;)`")))
			}
		}

		if !gitWord.MatchString(trimmed) {
			continue
		}

		for _, fragment := range gitFragments(trimmed) {
			if strings.HasPrefix(strings.ToLower(fragment), "git") {
				invocations = append(invocations, fragment)
			}
		}
	}

	return invocations
}

// gitFragments returns, for every `git` the fragment pattern finds, the text
// from that `git` up to the first ; & | $ ) ` ' or ", trimmed.
func gitFragments(text string) []string {
	locations := gitFragment.FindAllStringIndex(text, -1)
	fragments := make([]string, 0, len(locations))

	for _, loc := range locations {
		match := text[loc[0]:loc[1]]
		offset := strings.Index(strings.ToLower(match), "git")
		rest := text[loc[0]+offset:]
		fragments = append(fragments, jsTrim(jsFirstSegment(rest, ";&|$)`'\"")))
	}

	return fragments
}

// ContainsGitWriteBypass reports whether a command smuggles a git write
// through a subshell (`bash -c ...`), eval, a pipe chain or a command
// substitution. It complements IsGitAllowed.
func ContainsGitWriteBypass(command string) bool {
	for _, pattern := range subshellPatterns {
		for _, match := range pattern.FindAllStringSubmatch(command, -1) {
			inner := match[1]
			if strings.Contains(inner, "git") && !IsGitAllowed(inner) {
				return true
			}
		}
	}

	for _, segment := range strings.Split(command, "|") {
		trimmed := jsTrim(segment)
		if trimmed != "" && !IsGitAllowed(trimmed) {
			return true
		}
	}

	for _, fragment := range gitFragments(command) {
		if strings.HasPrefix(strings.ToLower(fragment), "git") && !IsGitAllowed(fragment) {
			return true
		}
	}

	// A shell that reads its script from stdin runs text the checks above
	// only saw inside quotes, so the whole command is scanned unquoted.
	if FeedsShellFromStdin(command) {
		unquoted := unquoteWord(command)
		for _, invocation := range ExtractGitInvocations(unquoted) {
			if !IsGitAllowed(invocation) {
				return true
			}
		}
	}

	return false
}

// FeedsShellFromStdin reports whether a shell in the command takes its
// script from stdin or a heredoc.
func FeedsShellFromStdin(command string) bool {
	return pipeIntoShell.MatchString(command) || shellHeredoc.MatchString(command)
}

// ShellScriptTargets returns the script files a command runs through a shell
// (`sh run.sh`, `bash -e x.sh`, `source x.sh`, `. x.sh`).
func ShellScriptTargets(command string) []string {
	targets := []string{}

	for _, phrase := range jsSplit(command, phraseOrPipe) {
		rawWords := jsSplitWhitespace(jsTrim(phrase))
		words := make([]string, len(rawWords))

		for i, word := range rawWords {
			words[i] = unquoteWord(word)
		}

		progIdx := programIndex(words)
		if progIdx == -1 {
			continue
		}

		prog := strings.ToLower(jsLastPathPart(words[progIdx], "/"))
		i := progIdx + 1

		switch {
		case shellCommandName.MatchString(prog):
			for i < len(words) && strings.HasPrefix(words[i], "-") {
				if strings.Contains(words[i], "c") {
					i = -1 // `sh -c '...'` runs a string, handled elsewhere

					break
				}

				i++
			}
		case prog != "source" && prog != ".":
			continue
		}

		if i >= 0 && i < len(words) && !strings.HasPrefix(words[i], "<") {
			targets = append(targets, words[i])
		}
	}

	return targets
}

// WritesFile reports whether the command itself writes path (`> path`,
// `>> path`, `tee path`).
func WritesFile(command, path string) bool {
	pattern, err := regexp.Compile(`(?:>>?|\btee(?:` + jsSpace + `+-a)?)` + jsSpace + `*["']?` +
		regexp.QuoteMeta(path) + `["']?(?:` + jsSpace + `|$|[;&|])`)
	if err != nil {
		return false
	}

	return pattern.MatchString(command)
}

// StripFlagValues removes --flag=value arguments, so text a user typed as a
// value (`--answer="use git"`) is not scanned as a command.
func StripFlagValues(command string) string {
	command = flagValueSingle.ReplaceAllLiteralString(command, "")
	command = flagValueDouble.ReplaceAllLiteralString(command, "")

	return flagValueBare.ReplaceAllLiteralString(command, "")
}

// HasGitWrite reports whether a command performs or smuggles any git write.
func HasGitWrite(command string) bool {
	cleaned := StripFlagValues(command)

	for _, invocation := range ExtractGitInvocations(cleaned) {
		if !IsGitAllowed(invocation) {
			return true
		}
	}

	return ContainsGitWriteBypass(cleaned)
}
