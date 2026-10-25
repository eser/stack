// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"regexp"
	"slices"
	"strconv"
	"strings"
)

// The noskills hook commands the generated tool configs run, and how long
// each tool waits for them. Port of sync/hook-commands.ts; the sync adapters
// (TASK-259) build their configs from these.

// HookEvent is an `invoke-hook` subcommand the tool configs run.
type HookEvent string

// The hook events, in the order the configs list them.
const (
	HookSessionStart        HookEvent = "session-start"
	HookPreToolUse          HookEvent = "pre-tool-use"
	HookPostFileWrite       HookEvent = "post-file-write"
	HookPostBash            HookEvent = "post-bash"
	HookPostAskUserQuestion HookEvent = "post-ask-user-question"
	HookStop                HookEvent = "stop"
)

// HookEvents lists every hook event.
func HookEvents() []HookEvent {
	return []HookEvent{
		HookSessionStart, HookPreToolUse, HookPostFileWrite, HookPostBash, HookPostAskUserQuestion, HookStop,
	}
}

// HookTimeoutSeconds is how long a tool waits for a hook. PreToolUse gets
// as long as the git wrapper's check (GitCheckTimeoutSeconds), which
// TASK-163 raised for hook commands that start through npx. A hook that
// calls the Go binary answers in milliseconds, so the limit only matters for
// configs that still run noskills through a package runner.
func HookTimeoutSeconds(event HookEvent) int {
	switch event {
	case HookSessionStart:
		return 5
	case HookPreToolUse:
		return GitCheckTimeoutSeconds
	case HookStop:
		return 10
	case HookPostFileWrite, HookPostBash, HookPostAskUserQuestion:
		return 3
	default:
		return 3
	}
}

// HookCommand is the shell command a tool config runs for one hook:
// `<commandPrefix> invoke-hook <event> [args]`.
func HookCommand(commandPrefix string, event HookEvent, args ...string) string {
	return strings.Join(append([]string{commandPrefix, "invoke-hook", string(event)}, args...), " ")
}

var noskillsHookPattern = regexp.MustCompile(`\binvoke-hook (?:session-start|pre-tool-use|post-file-write|` + //nolint:gochecknoglobals // compiled once
	`post-bash|post-ask-user-question|stop)(?:` + jsSpace + `|$)`)

// IsNoskillsHookCommand reports whether command runs a noskills hook. A sync
// that merges its hooks into a config the user also edits replaces the
// entries this matches and keeps the others.
func IsNoskillsHookCommand(command any) bool {
	s, ok := command.(string)

	return ok && noskillsHookPattern.MatchString(s)
}

// UserHookGroups returns the hooks of a Claude Code or Codex settings file
// without the handlers that run a noskills hook. A group left without
// handlers is dropped, and so is an event left without groups or whose
// value is not a list. Groups of another shape stay as they are.
func UserHookGroups(hooks any) *JSObject {
	kept := NewJSObject()

	o, ok := hooks.(*JSObject)
	if !ok {
		return kept
	}

	for _, event := range o.orderedKeys() {
		groups, isList := o.values[event].([]any)
		if !isList {
			continue
		}

		userGroups := []any{}

		for _, group := range groups {
			groupObject, isObject := group.(*JSObject)

			handlersValue, _ := groupObject.get("hooks")
			handlers, handlersOK := handlersValue.([]any)

			if !isObject || !handlersOK {
				userGroups = append(userGroups, group)

				continue
			}

			userHandlers := slices.DeleteFunc(slices.Clone(handlers), func(handler any) bool {
				handlerObject, isHandler := handler.(*JSObject)
				if !isHandler {
					return false
				}

				command, _ := handlerObject.get("command")

				return IsNoskillsHookCommand(command)
			})

			if len(userHandlers) > 0 {
				copied := groupObject.clone()
				copied.set("hooks", userHandlers)
				userGroups = append(userGroups, copied)
			}
		}

		if len(userGroups) > 0 {
			kept.set(event, userGroups)
		}
	}

	return kept
}

// MergeHookGroups returns userHooks with noskills' groups added after the
// user's in each event, the order in which the tool runs them.
func MergeHookGroups(userHooks, noskillsHooks *JSObject) *JSObject {
	merged := NewJSObject()

	for _, event := range userHooks.orderedKeys() {
		groups, _ := userHooks.values[event].([]any)
		merged.set(event, slices.Clone(groups))
	}

	for _, event := range noskillsHooks.orderedKeys() {
		existing, _ := merged.get(event)
		existingGroups, _ := existing.([]any)
		added, _ := noskillsHooks.values[event].([]any)
		merged.set(event, append(slices.Clone(existingGroups), added...))
	}

	return merged
}

// packageRunners fetch the package they run from a registry when it is
// missing or, for an @latest spec, older than the registry's latest.
func packageRunners() []string {
	return []string{"npx", "pnpx", "bunx"}
}

func subcommandRunners(program string) []string {
	switch program {
	case "npm":
		return []string{"exec", "x"}
	case "pnpm", "yarn":
		return []string{"dlx"}
	default:
		return nil
	}
}

var remoteModule = regexp.MustCompile(`^(?:jsr|npm|https?):`) //nolint:gochecknoglobals // compiled once

// NetworkRunnerOf is how a noskills command reaches the network before
// noskills runs, or "" when it runs an installed noskills: npx, pnpx, bunx,
// npm exec, npm x, pnpm dlx and yarn dlx may fetch the package, and
// `deno run` or `deno x` with a jsr:, npm: or http(s): module downloads it
// when its cache lacks it (decision-12 keeps the Deno forms). Leading
// NAME=value assignments are skipped.
func NetworkRunnerOf(command string) string {
	words := jsSplitWhitespace(jsTrim(command))

	start := slices.IndexFunc(words, func(word string) bool { return !envAssignment.MatchString(word) })
	if start == -1 {
		return ""
	}

	rest := words[start:]
	word := func(i int) string {
		if i < len(rest) {
			return rest[i]
		}

		return ""
	}

	program, subcommand := word(0), word(1)

	switch {
	case slices.Contains(packageRunners(), program):
		return program
	case slices.Contains(subcommandRunners(program), subcommand):
		return program + " " + subcommand
	case program == "deno" && (subcommand == "run" || subcommand == "x"):
		if len(rest) > 2 {
			if i := slices.IndexFunc(rest[2:], remoteModule.MatchString); i >= 0 {
				return "deno " + subcommand + " " + rest[2+i]
			}
		}
	}

	return ""
}

// NetworkCommandWarning is the warning init shows when command reaches the
// network before noskills runs, or "" when it does not.
func NetworkCommandWarning(command string) string {
	runner := NetworkRunnerOf(command)
	if runner == "" {
		return ""
	}

	return `The hooks run noskills as "` + command + `", and ` + runner + ` can wait on the network before ` +
		`noskills starts. Claude Code, Codex, Copilot CLI and Kiro let a tool call go ahead when its PreToolUse ` +
		`hook does not answer within ` + strconv.Itoa(HookTimeoutSeconds(HookPreToolUse)) + ` seconds, so the ` +
		`git guard and the protected-file check would not apply to that call. Install the eser CLI (npm install ` +
		`-g eser) and run "eser noskills init" so the hooks call the installed command.`
}
