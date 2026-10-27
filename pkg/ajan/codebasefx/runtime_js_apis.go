// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package codebasefx

import (
	"fmt"
	"path/filepath"
	"slices"
	"strings"
)

// The rules of ValidateRuntimeJSAPIs. Library code reaches the file system,
// the environment and the process through `runtime` from
// @eserstack/standards/cross-runtime (javascript-practices: Cross-Runtime
// APIs), and the repository runs on Node only (decision-15), so:
//
//   - every reference to the `Deno` or the `Bun` identifier in code is
//     reported: `Deno.cwd()`, `globalThis.Deno`, an alias such as `g.Bun`, a
//     `typeof Deno` check, in test files too;
//   - a member of Node's global `process` is reported (decision-16), unless
//     the file binds its own `process` (a child process handle, a parameter,
//     `const { process } = runtime`); such a file is checked only for
//     `process.env` and `globalThis.process.*`, which no such binding has.
//     `globalThis` counts with its aliases (`const g = globalThis as any`),
//     and every member access counts with optional chaining too:
//     `globalThis?.process?.cwd()` and `g.process?.env` are reported like
//     `process.cwd()`.
//
// The source is read through the TypeScript lexer, so text in comments and in
// string, template and regular expression literals never counts: a user
// project's "deno.json" stays legal (decision-12).
const (
	runtimeRuleDeno    = "deno"
	runtimeRuleBun     = "bun"
	runtimeRuleProcess = "process"
)

// runtimeAPIReference closes every message with the rule that requires it.
const runtimeAPIReference = "(javascript-practices: Cross-Runtime APIs)"

// runtimeAPIDefaultReplacement is the hint for a member with no listed one.
const runtimeAPIDefaultReplacement = "the matching runtime API"

// crossRuntimeDir is the cross-runtime layer, which implements the facade on
// Node's own globals and is therefore not checked.
const crossRuntimeDir = "standards/cross-runtime/"

// runtimeAPIReplacements maps a rule and a member to the cross-runtime API
// that replaces it.
var runtimeAPIReplacements = map[string]map[string]string{ //nolint:gochecknoglobals
	runtimeRuleDeno: {
		"cwd":           "runtime.process.cwd()",
		"env":           "runtime.env",
		"readTextFile":  "runtime.fs.readTextFile()",
		"readFile":      "runtime.fs.readFile()",
		"writeTextFile": "runtime.fs.writeTextFile()",
		"writeFile":     "runtime.fs.writeFile()",
		"mkdir":         "runtime.fs.mkdir()",
		"remove":        "runtime.fs.remove()",
		"stat":          "runtime.fs.stat()",
		"lstat":         "runtime.fs.lstat()",
		"readDir":       "runtime.fs.readDir()",
		"copyFile":      "runtime.fs.copyFile()",
		"rename":        "runtime.fs.rename()",
		"open":          "runtime.fs (or @eserstack/streams)",
		"exit":          "runtime.process.exit()",
		"Command":       "runtime.exec.spawn() (or @eserstack/shell/exec)",
		"args":          "runtime.process.args",
	},
	runtimeRuleBun: {
		"env":       "runtime.env.get()",
		"argv":      "runtime.process.args",
		"spawn":     "runtime.exec.spawn() (or @eserstack/shell/exec)",
		"spawnSync": "runtime.exec.spawn() (or @eserstack/shell/exec)",
		"file":      "runtime.fs",
		"write":     "runtime.fs.writeFile()",
		"version":   "runtime.version",
	},
	runtimeRuleProcess: {
		"env":      "runtime.env.get()",
		"argv":     "runtime.process.args",
		"cwd":      "runtime.process.cwd()",
		"chdir":    "runtime.process.chdir()",
		"exit":     "runtime.process.exit()",
		"exitCode": "runtime.process.setExitCode()",
		"execPath": "runtime.process.execPath()",
		"pid":      "runtime.process.pid",
		"stdin":    "runtime.process.stdin",
		"stdout":   "runtime.process.stdout",
		"stderr":   "runtime.process.stderr",
		"platform": "getPlatform()",
		"arch":     "getArch()",
	},
}

// runtimeAPILabels names the runtime of each rule in its message.
var runtimeAPILabels = map[string]string{ //nolint:gochecknoglobals
	runtimeRuleDeno:    "Deno",
	runtimeRuleBun:     "Bun",
	runtimeRuleProcess: "Node.js",
}

// ValidateRuntimeJSAPIs reports direct Deno, Bun and Node.js process API use
// in a JavaScript or TypeScript source; see the rules above. Files outside
// codeConventionsExtensions and files of the cross-runtime layer are skipped.
func ValidateRuntimeJSAPIs(path string, content []byte) []ValidatorIssue {
	slashed := filepath.ToSlash(path)
	if !slices.Contains(codeConventionsExtensions, strings.ToLower(filepath.Ext(path))) ||
		strings.Contains(slashed, crossRuntimeDir) {
		return nil
	}

	tokens := code(lexTS(content))
	shadowsProcess := bindsProcess(tokens)
	globals := globalThisAliases(tokens)

	var issues []ValidatorIssue

	for i, tok := range tokens {
		if tok.Kind != tsIdent {
			continue
		}

		switch tok.Text {
		case "Deno":
			issues = append(issues, runtimeIssue(path, tokens, i, runtimeRuleDeno))
		case "Bun":
			issues = append(issues, runtimeIssue(path, tokens, i, runtimeRuleBun))
		case "process":
			viaGlobalThis := isGlobalThisMember(tokens, i, globals)
			if !viaGlobalThis && i > 0 && tokens[i-1].Text == "." {
				continue // runtime.process.x and other member accesses
			}

			_, member := memberAfter(tokens, i)
			if member == "" || (shadowsProcess && !viaGlobalThis && member != "env") {
				continue
			}

			issues = append(issues, runtimeIssue(path, tokens, i, runtimeRuleProcess))
		}
	}

	return issues
}

// code drops the comments, string, template and regular expression literals
// from tokens, so neighbours in the result are neighbours in code.
func code(tokens []tsToken) []tsToken {
	kept := make([]tsToken, 0, len(tokens))

	for _, tok := range tokens {
		switch tok.Kind {
		case tsComment, tsString, tsTemplate, tsRegex:
		case tsIdent, tsNumber, tsPunct:
			kept = append(kept, tok)
		}
	}

	return kept
}

// memberAfter returns the operator and the name in `x.name` or `x?.name`
// when tokens[i] is x, or "" and "". The lexer emits `?.` as two tokens.
func memberAfter(tokens []tsToken, i int) (string, string) {
	switch {
	case i+2 < len(tokens) && tokens[i+1].Text == "." && tokens[i+2].Kind == tsIdent:
		return ".", tokens[i+2].Text
	case i+3 < len(tokens) && tokens[i+1].Text == "?" && tokens[i+2].Text == "." &&
		tokens[i+3].Kind == tsIdent:
		return "?.", tokens[i+3].Text
	}

	return "", ""
}

// receiverBefore returns the index of x and the operator in `x.name` or
// `x?.name` when tokens[i] is name and x is an identifier, or -1 and "".
func receiverBefore(tokens []tsToken, i int) (int, string) {
	if i < 2 || tokens[i-1].Text != "." {
		return -1, ""
	}

	receiver, operator := i-2, "."
	if tokens[receiver].Text == "?" {
		receiver, operator = i-3, "?."
	}

	if receiver < 0 || tokens[receiver].Kind != tsIdent {
		return -1, ""
	}

	return receiver, operator
}

// isGlobalThisMember reports whether tokens[i] is reached as globalThis.x,
// globalThis?.x or through one of the aliases of globalThis.
func isGlobalThisMember(tokens []tsToken, i int, aliases map[string]bool) bool {
	receiver, _ := receiverBefore(tokens, i)

	return receiver >= 0 && (tokens[receiver].Text == "globalThis" || aliases[tokens[receiver].Text])
}

// globalThisAliases returns the names the code binds to globalThis itself,
// as in `const g = globalThis as any;`; `const x = globalThis.y` binds a
// member, not an alias.
func globalThisAliases(tokens []tsToken) map[string]bool {
	aliases := map[string]bool{}

	for i := 0; i+3 < len(tokens); i++ {
		switch tokens[i].Text {
		case "const", "let", "var":
		default:
			continue
		}

		if tokens[i+1].Kind != tsIdent || tokens[i+2].Text != "=" || tokens[i+3].Text != "globalThis" {
			continue
		}

		if operator, _ := memberAfter(tokens, i+3); operator == "" {
			aliases[tokens[i+1].Text] = true
		}
	}

	return aliases
}

// runtimeIssue reports the reference at tokens[i]: the receiver it is read
// from (globalThis, an alias), the identifier and the member it reads.
func runtimeIssue(path string, tokens []tsToken, i int, rule string) ValidatorIssue {
	text := tokens[i].Text
	line := tokens[i].Line

	if receiver, operator := receiverBefore(tokens, i); receiver >= 0 {
		text = tokens[receiver].Text + operator + text
		line = tokens[receiver].Line
	}

	operator, member := memberAfter(tokens, i)
	if member != "" {
		text += operator + member
	}

	replacement, ok := runtimeAPIReplacements[rule][member]
	if !ok {
		replacement = runtimeAPIDefaultReplacement
	}

	return ValidatorIssue{
		Severity: "error",
		File:     path,
		Line:     line,
		Message: fmt.Sprintf(
			"direct %s API usage: %s; use %s from @eserstack/standards/cross-runtime %s",
			runtimeAPILabels[rule], text, replacement, runtimeAPIReference,
		),
		Fixed: false,
	}
}

// bindsProcess reports whether the code declares its own `process`:
// `const process = spawn()`, `const { process } = runtime`, or a parameter
// such as `(process: ChildProcess)`.
func bindsProcess(tokens []tsToken) bool {
	for i, tok := range tokens {
		switch {
		case tok.Kind == tsIdent && (tok.Text == "const" || tok.Text == "let" || tok.Text == "var"):
			if declaresProcess(tokens, i+1) {
				return true
			}
		case tok.Text == "(" || tok.Text == ",":
			if isProcessParameter(tokens, i+1) {
				return true
			}
		}
	}

	return false
}

// declaresProcess reports whether the declaration whose name starts at
// tokens[i] is `process` or destructures a `process`.
func declaresProcess(tokens []tsToken, i int) bool {
	if i >= len(tokens) {
		return false
	}

	if tokens[i].Text == "process" {
		return true
	}

	if tokens[i].Text != "{" {
		return false
	}

	for j := i + 1; j+1 < len(tokens) && tokens[j].Text != "}"; j++ {
		if tokens[j].Text == "process" && (tokens[j+1].Text == "," || tokens[j+1].Text == "}") {
			return true
		}
	}

	return false
}

// isProcessParameter reports whether tokens[i] is `process` followed by what
// follows a parameter name: `:`, `,`, `)`, `=` or an optional `?`.
func isProcessParameter(tokens []tsToken, i int) bool {
	if i+1 >= len(tokens) || tokens[i].Text != "process" {
		return false
	}

	next := tokens[i+1].Text
	if next == "?" && i+2 < len(tokens) {
		next = tokens[i+2].Text
	}

	return next == ":" || next == "," || next == ")" || next == "="
}
