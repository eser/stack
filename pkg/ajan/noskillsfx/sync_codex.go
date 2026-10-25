// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

package noskillsfx

import (
	"fmt"
	"regexp"
	"strings"
)

// The Codex CLI adapter (sync/adapters/codex.ts): AGENTS.md, the hooks in
// .codex/hooks.json (PascalCase events with matcher groups), the agents as
// TOML in .codex/agents/ and the MCP server under [mcp_servers.noskills] in
// .codex/config.toml.

// codexHooks is buildHooks in codex.ts.
func codexHooks(prefix string) *JSObject {
	return JSObjectOf(
		"SessionStart", []any{hookGroup("", commandHook(prefix, HookSessionStart))},
		"PreToolUse", []any{hookGroup("^(Bash|apply_patch)$", commandHook(prefix, HookPreToolUse))},
		"PostToolUse", []any{
			hookGroup("^apply_patch$", commandHook(prefix, HookPostFileWrite)),
			hookGroup("^Bash$", commandHook(prefix, HookPostBash)),
		},
		"Stop", []any{hookGroup("", commandHook(prefix, HookStop))},
	)
}

// codexUserHooks is userHooksOf: the hooks of the file that are not
// noskills'. Earlier versions wrote a list of {event, command} entries,
// which Codex does not read; the user's entries there become groups.
func codexUserHooks(hooks any) *JSObject {
	entries, isList := hooks.([]any)
	if !isList {
		return UserHookGroups(hooks)
	}

	kept := NewJSObject()

	for _, entry := range entries {
		o, ok := entry.(*JSObject)
		if !ok || o.isTrue("_noskills") {
			continue
		}

		event, eventOK := o.strOK("event")
		command, commandOK := o.strOK("command")

		if !eventOK || !commandOK {
			continue
		}

		groups, _ := kept.get(event)
		list, _ := groups.([]any)
		kept.set(event, append(list, JSObjectOf("hooks", []any{JSObjectOf("type", "command", "command", command)})))
	}

	return kept
}

func syncCodexHooks(c *SyncContext) error {
	path := c.path(".codex/hooks.json")

	existing, _ := readJSONFile(path)

	file, ok := existing.(*JSObject)
	if !ok {
		file = NewJSObject()
	}

	hooks, _ := file.get("hooks")
	merged := file.clone()
	merged.set("hooks", MergeHookGroups(codexUserHooks(hooks), codexHooks(c.CommandPrefix)))

	return writeSyncFile(path, jsonStringifyIndent(merged)+"\n")
}

func codexExecutorToml(prefix string) string {
	instructions := make([]string, 0, 20) //nolint:mnd // the lines of the prompt
	instructions = append(instructions, executorIntro, "", "## Self-Verification",
		"After completing the task, you MUST verify your own work before reporting:")
	instructions = append(instructions, executorSelfCheck()...)
	instructions = append(instructions,
		"",
		"## Reporting",
		"When finished, provide a structured JSON summary:",
		`{"completed": ["<item IDs done>"], "remaining": ["<item IDs not done>"],`,
		` "blocked": ["<item IDs needing decisions>"], "filesModified": ["<paths>"],`,
		` "verification": {"typeCheck": "pass|fail", "tests": "pass|fail"}}`,
		"",
		executorNoRawOut,
		"The orchestrator will submit this to `"+prefix+" next --answer` on your behalf.",
	)

	return strings.Join([]string{
		`name = "noskills-executor"`,
		`description = "Executes a single noskills task. Follows spec behavioral rules and reports structured results."`,
		`developer_instructions = """`,
		strings.Join(instructions, "\n"),
		`"""`,
		"",
	}, "\n")
}

func codexVerifierToml() string {
	instructions := make([]string, 0, 16) //nolint:mnd // the lines of the prompt
	instructions = append(instructions, verifierIntro, "", "## Verification Steps")
	instructions = append(instructions, verifierSteps()...)
	instructions = append(instructions,
		"",
		"## Report Format",
		"When finished, provide a structured JSON summary:",
		`{"results": [{"id": "ac-1", "status": "PASS", "evidence": "..."},`,
		` {"id": "ac-2", "status": "FAIL", "reason": "..."}]}`,
		"",
		verifierReportUse,
	)

	return strings.Join([]string{
		`name = "noskills-verifier"`,
		`description = "Independently verifies completed task work. Read-only. Never sees the executor's context."`,
		`developer_instructions = """`,
		strings.Join(instructions, "\n"),
		`"""`,
		"",
	}, "\n")
}

func syncCodexAgents(c *SyncContext) error {
	if err := writeSyncFile(c.path(".codex/agents/noskills-executor.toml"), codexExecutorToml(c.CommandPrefix)); err != nil {
		return err
	}

	return writeSyncFile(c.path(".codex/agents/noskills-verifier.toml"), codexVerifierToml())
}

// codexMcpToml is buildMcpToml: each word is a TOML basic string, so a
// prefix with a Windows path or a quote stays valid TOML (TASK-327).
func codexMcpToml(prefix string) string {
	parts := splitCommandPrefix(prefix)

	args := make([]string, 0, len(parts))
	for _, part := range append(parts[1:len(parts):len(parts)], "mcp-serve") {
		args = append(args, tomlBasicString(part))
	}

	return "[mcp_servers.noskills]\ncommand = " + tomlBasicString(parts[0]) + "\nargs = [" + strings.Join(args, ", ") + "]\n"
}

// tomlBasicString quotes s as tomlString in sync/adapters/codex.ts does.
func tomlBasicString(s string) string {
	var b strings.Builder

	b.WriteByte('"')

	for _, r := range s {
		switch {
		case r == '\\':
			b.WriteString(`\\`)
		case r == '"':
			b.WriteString(`\"`)
		case r == '\n':
			b.WriteString(`\n`)
		case r == '\t':
			b.WriteString(`\t`)
		case r == '\r':
			b.WriteString(`\r`)
		case r < 0x20 || r == 0x7f:
			fmt.Fprintf(&b, `\u%04x`, r)
		default:
			b.WriteRune(r)
		}
	}

	b.WriteByte('"')

	return b.String()
}

// tomlHeader is a TOML table header line: [name] or [[name]] with a bare or
// dotted key and an optional comment.
var tomlHeader = regexp.MustCompile(`^` + jsSpace + `*\[\[?` + jsSpace + `*([A-Za-z0-9_.-]+)` + jsSpace + //nolint:gochecknoglobals // compiled once
	`*\]\]?` + jsSpace + `*(?:#[^\r\x{2028}\x{2029}]*)?$`)

const noskillsMcpTable = "mcp_servers.noskills"

// WithoutNoskillsMcpTable is withoutNoskillsMcpTable: the TOML text without
// the [mcp_servers.noskills] table and its sub-tables, every other line as
// it was.
func WithoutNoskillsMcpTable(toml string) string {
	inNoskills := false
	lines := strings.Split(toml, "\n")
	kept := make([]string, 0, len(lines))

	for _, line := range lines {
		if header := tomlHeader.FindStringSubmatch(line); header != nil {
			name := header[1]
			inNoskills = name == noskillsMcpTable || strings.HasPrefix(name, noskillsMcpTable+".")
		}

		if !inNoskills {
			kept = append(kept, line)
		}
	}

	return strings.Join(kept, "\n")
}

func syncCodexMcp(c *SyncContext) error {
	path := c.path(".codex/config.toml")

	existing, _ := readOptionalFile(path)
	cleaned := jsTrimEnd(WithoutNoskillsMcpTable(existing))

	separator := ""
	if cleaned != "" {
		separator = "\n\n"
	}

	return writeSyncFile(path, cleaned+separator+codexMcpToml(c.CommandPrefix))
}
